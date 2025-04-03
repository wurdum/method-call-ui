// App.js
import React, { useState, useEffect, useRef } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import io from 'socket.io-client';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';

// Register the dagre layout with cytoscape
cytoscape.use(dagre);

// Utility function to convert Cytoscape.js graph to Mermaid flowchart format
const exportToMermaid = (cy) => {
  // Get the basic Cytoscape JSON
  const cytoscapeJson = cy.json().elements;
  
  // Start building the Mermaid flowchart string
  let mermaidCode = 'flowchart TD\n';
  
  // Process nodes first - create node definitions
  if (cytoscapeJson.nodes) {
    cytoscapeJson.nodes.forEach((node) => {
      // Clean the ID to ensure it works in Mermaid
      const cleanId = node.data.id.replace(/[^a-zA-Z0-9]/g, '0');
      
      // Extract a readable label from the node data
      // If the label contains newlines, replace them with spaces or <br>
      let nodeLabel = node.data.label || node.data.id;
      nodeLabel = nodeLabel.replace(/\n/g, '<br>');
      
      // Add node definition to Mermaid code
      mermaidCode += `    ${cleanId}["${nodeLabel}"];\n`;
    });
  }
  
  // Add a blank line for readability
  mermaidCode += '\n';
  
  // Process edges - create edge connections
  if (cytoscapeJson.edges) {
    cytoscapeJson.edges.forEach((edge) => {
      // Clean the IDs to ensure they work in Mermaid
      const sourceId = edge.data.source.replace(/[^a-zA-Z0-9]/g, '0');
      const targetId = edge.data.target.replace(/[^a-zA-Z0-9]/g, '0');
      
      // Add edge with optional count label
      const edgeLabel = edge.data.count ? ` |${edge.data.count}|` : '';
      mermaidCode += `    ${sourceId} -->`;
      
      // Add label if it exists
      if (edgeLabel) {
        mermaidCode += edgeLabel;
      }
      
      mermaidCode += ` ${targetId};\n`;
    });
  }
  
  return mermaidCode;
};

// Function to trigger download of text content
const downloadText = (text, filename) => {
  const dataStr = "data:text/plain;charset=utf-8," + encodeURIComponent(text);
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", filename);
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
};

function App() {
  const [elements, setElements] = useState([]);
  const cyRef = useRef(null);
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [layoutDirection, setLayoutDirection] = useState('TB');

  // Define the function to add stack frames to the graph
  const addStackFrameToGraph = (stackFrameData) => {
    console.log("Processing stack frame data:", stackFrameData);
    
    if (!stackFrameData || !stackFrameData.sequence || !Array.isArray(stackFrameData.sequence)) {
      console.error("Invalid stack frame data:", stackFrameData);
      return;
    }
    
    const { sequence } = stackFrameData;
    const newElements = [];
  
    // Helper function to generate labels with count
    const generateLabelWithCount = (file, lineNumber, structureName, methodName, count) => {
      return `${file}:${lineNumber}\n${structureName}:${methodName}()`;
    };
    
    // Helper function to generate node id
    const generateNodeId = (frame) => {
      return `${frame.file}-${frame.structureName}-${frame.methodName}`.replace(/[^a-zA-Z0-9]/g, '_');
    };
    
    // Create nodes for each stack frame
    sequence.forEach((frame, index) => {
      const nodeId = generateNodeId(frame);
      
      newElements.push({
        data: {
          id: nodeId,
          label: generateLabelWithCount(frame.file, frame.lineNumber, frame.structureName, frame.methodName, 1),
          file: frame.file,
          lineNumber: frame.lineNumber,
          structureName: frame.structureName,
          methodName: frame.methodName,
          count: 1
        }
      });
      
      // Create edges between consecutive frames
      if (index < sequence.length - 1) {
        const nextFrame = sequence[index + 1];
        const nextNodeId =  generateNodeId(nextFrame);
        const edgeId = `${nodeId}->${nextNodeId}`;
        
        newElements.push({
          data: {
            id: edgeId,
            source: nodeId,
            target: nextNodeId,
            count: 1
          }
        });
      }
    });
    
    console.log("New elements to add:", newElements);
    
    // Use functional update to avoid stale state issues
    setElements(prevElements => {
      // Create a map of existing elements for easier lookup
      const existingElementsMap = new Map();
      prevElements.forEach(el => existingElementsMap.set(el.data.id, el));
      
      // Process each new element
      const updatedElements = [...prevElements];
      
      newElements.forEach(newEl => {
        const existingEl = existingElementsMap.get(newEl.data.id);
        
        if (existingEl) {
          // Element already exists, increment the count
          const updatedCount = existingEl.data.count + 1;
          
          // Find the index of the existing element
          const index = updatedElements.findIndex(el => el.data.id === newEl.data.id);
          
          // Update the element with the new count and updated label
          if (index !== -1) {
            updatedElements[index] = {
              ...existingEl,
              data: {
                ...existingEl.data,
                count: updatedCount,
                label: generateLabelWithCount(
                  existingEl.data.file,
                  existingEl.data.lineNumber,
                  existingEl.data.structureName,
                  existingEl.data.methodName,
                  updatedCount
                )
              }
            };
          }
        } else {
          // This is a new element, add it to the array
          updatedElements.push(newEl);
        }
      });
      
      return updatedElements;
    });
  };

  // Effect for initializing the WebSocket connection
  useEffect(() => {
    // Connect to WebSocket server
    socketRef.current = io('http://localhost:3001');
    
    // Listen for connection event
    socketRef.current.on('connect', () => {
      console.log('Connected to WebSocket server with ID:', socketRef.current.id);
      setConnected(true);
    });
    
    // Listen for new stack frame sequences
    socketRef.current.on('newStackFrame', (data) => {
      console.log('Received new stack frame via WebSocket:', data);
      setLastMessage(data);
      addStackFrameToGraph(data);
    });
    
    // Listen for disconnect event
    socketRef.current.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
      setConnected(false);
    });
    
    // Listen for connection error
    socketRef.current.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      setConnected(false);
    });
    
    // Clean up on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);
  
  // Effect for updating the Cytoscape layout when elements change
  useEffect(() => {
    if (cyRef.current && elements.length > 0) {
      console.log("Elements updated, running layout");
      cyRef.current.layout({
        name: 'dagre',
        rankDir: layoutDirection,
        nodeSep: 120,
        rankSep: 40,
        animate: true,
        animationDuration: 300
      }).run();
    }
  }, [elements, layoutDirection]);

  const cytoscapeStylesheet = [
    // Base node styling
    {
      selector: 'node',
      style: {
        'background-color': '#fafbff',     // Light gray background
        'background-opacity': 1,           // Make background visible
        'border-width': 1,                 // Consistent border width
        'border-color': '#ddd',            // Light border
        'label': 'data(label)',
        'text-wrap': 'wrap',
        'text-max-width': '200px',
        'line-height': 1.5,
        'width': 'label',
        'height': 'label',
        'padding': '8px',
        'font-size': '10px',
        'text-valign': 'center',
        'text-halign': 'center',
        'shape': 'round-rectangle',
        'border-radius': 4,
        'color': '#333',                   // Dark text for contrast
      }
    },
    
    // Heat map coloring for nodes based on count
    // Very low frequency (counts: 1-3)
    {
      selector: 'node[count <= 3]',
      style: {
        'background-color': '#f0f2fc',     // Very light gray
        'border-color': '#e0e0e0',
      }
    },
    // Low frequency (counts: 4-7)
    {
      selector: 'node[count > 3][count <= 7]',
      style: {
        'background-color': '#e1e5f7',     // Light gray
        'border-color': '#bdbdbd',
        'color': '#333'
      }
    },
    // Medium frequency (counts: 8-15)
    {
      selector: 'node[count > 7][count <= 15]',
      style: {
        'background-color': '#d7ddfa',     // Light blue
        'border-color': '#7ab7e0',
      }
    },
    // High frequency (counts: 16-30)
    {
      selector: 'node[count > 15][count <= 30]',
      style: {
        'background-color': '#cdd4fa',     // Medium blue
        'border-color': '#4a99c9',
      }
    },
    // Very high frequency (counts: 31+)
    {
      selector: 'node[count > 30]',
      style: {
        'background-color': '#c0c9fc',     // Dark blue
        'border-color': '#08519c',
      }
    },
    
    // Base edge styling
    {
      selector: 'edge',
      style: {
        'label': 'data(count)',
        'font-size': '10px',
        'text-outline-width': 3,           // Text outline for readability
        'text-outline-color': '#fff',      // White outline around text
        'width': 1,                        // Consistent width for all edges
        'line-color': '#ddd',              // Light gray for low-frequency edges
        'target-arrow-color': '#ddd',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'opacity': 0.8                     // Slight transparency for edges
      }
    },
    
    // Edge color based on frequency
    // Very low frequency (counts: 1-3)
    {
      selector: 'edge[count <= 3]',
      style: {
        'line-color': '#e0e0e0',           // Very light gray
        'target-arrow-color': '#e0e0e0',
        'opacity': 0.7
      }
    },
    // Low frequency (counts: 4-7)
    {
      selector: 'edge[count > 3][count <= 7]',
      style: {
        'line-color': '#bdbdbd',           // Light gray
        'target-arrow-color': '#bdbdbd',
        'opacity': 0.8
      }
    },
    // Medium frequency (counts: 8-15)
    {
      selector: 'edge[count > 7][count <= 15]',
      style: {
        'line-color': '#9ecae1',           // Light blue
        'target-arrow-color': '#9ecae1',
        'opacity': 0.85
      }
    },
    // High frequency (counts: 16-30)
    {
      selector: 'edge[count > 15][count <= 30]',
      style: {
        'line-color': '#4292c6',           // Medium blue
        'target-arrow-color': '#4292c6',
        'opacity': 0.9
      }
    },
    // Very high frequency (counts: 31+)
    {
      selector: 'edge[count > 30]',
      style: {
        'line-color': '#084594',           // Dark blue
        'target-arrow-color': '#084594',
        'width': 1.5,                      // Only slightly thicker for highest frequency
        'opacity': 1
      }
    },
    
    // Hover styles to enhance interactivity
    {
      selector: 'node:hover',
      style: {
        'border-width': 2,
        'border-color': '#4682B4',         // Steel blue highlight for hover
        'z-index': 999                     // Bring hovered node to front
      }
    },
    {
      selector: 'edge:hover',
      style: {
        'width': 2,
        'line-color': '#4682B4',           // Steel blue highlight for hover
        'target-arrow-color': '#4682B4',
        'z-index': 999                     // Bring hovered edge to front
      }
    }
  ];

  // Add a test button and debug info
  return (
    <div style={{ height: '100vh', width: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px', borderBottom: '1px solid #ddd' }}>
        <h1 style={{ margin: '0' }}>Real-time Method Call Visualization</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <div style={{ 
            width: '10px', 
            height: '10px', 
            borderRadius: '50%', 
            backgroundColor: connected ? 'green' : 'red' 
          }}></div>
          <span>{connected ? 'Connected to server' : 'Disconnected'}</span>
        </div>
        <button 
          onClick={() => {
            const testData = {
              sequence: [
                { file: 'test.js', lineNumber: 1, structureName: 'Test', methodName: 'test' },
                { file: 'test2.js', lineNumber: 2, structureName: 'Test2', methodName: 'test2' }
              ]
            };
            console.log('Adding test data:', testData);
            addStackFrameToGraph(testData);
          }}
          style={{ marginRight: '10px', padding: '8px 16px' }}
        >
          Add Test Nodes
        </button>
        <button
          onClick={() => {
            console.log("Current elements:", elements);
            if (cyRef.current) {
              console.log("Cytoscape instance:", cyRef.current);
            }
          }}
          style={{ padding: '8px 16px' }}
        >
          Debug Elements
        </button>
        <button
          onClick={() => {
            setElements([]);
          }}
          style={{ marginLeft: '10px', padding: '8px 16px' }}
        >
          Clear Graph
        </button>
        <button
          onClick={() => {
            if (cyRef.current) {
              cyRef.current.layout({
                name: 'dagre',
                rankDir: 'TB',
                nodeSep: 40,
                rankSep: 50,
                edgeLength: 50,
                animate: true,
                animationDuration: 300
              }).run();
            }
          }}
          style={{ marginLeft: '10px', padding: '8px 16px' }}
        >
          Rearrange Nodes
        </button>
        <button
          onClick={() => {
            // Toggle between 'TB' (vertical) and 'LR' (horizontal)
            const newDirection = layoutDirection === 'TB' ? 'LR' : 'TB';
            setLayoutDirection(newDirection);
            
            // Apply the new layout
            if (cyRef.current) {
              cyRef.current.layout({
                name: 'dagre',
                rankDir: newDirection,
                nodeSep: 40,
                rankSep: 50,
                edgeLength: 50,
                animate: true,
                animationDuration: 300
              }).run();
            }
          }}
          style={{ marginLeft: '10px', padding: '8px 16px' }}
        >
          Switch to {layoutDirection === 'TB' ? 'Horizontal' : 'Vertical'} Layout
        </button>
        <button
          onClick={() => {
            if (cyRef.current) {
              const mermaidCode = exportToMermaid(cyRef.current);
              downloadText(mermaidCode, "graph-flowchart.md");
              
              // Optional: Show a preview or message
              console.log("Mermaid flowchart generated:", mermaidCode);
            }
          }}
          style={{ marginLeft: '10px', padding: '8px 16px' }}
        >
          Export as Mermaid
        </button>
      </div>
      
      <div style={{ flexGrow: 1, position: 'relative' }}>
        {elements.length === 0 ? (
          <div style={{ 
            position: 'absolute', 
            top: '50%', 
            left: '50%', 
            transform: 'translate(-50%, -50%)',
            textAlign: 'center'
          }}>
            <p>No method calls to display yet.</p>
            <p>Try clicking "Add Test Nodes" or send data via API.</p>
          </div>
        ) : (
          <CytoscapeComponent
            elements={elements}
            stylesheet={cytoscapeStylesheet}
            layout={{
              name: 'dagre',
              rankDir: layoutDirection,
              nodeSep: 120,
              rankSep: 40
            }}
            style={{ width: '100%', height: '100%' }}
            cy={(cy) => { cyRef.current = cy; }}
            wheelSensitivity={0.1}
          />
        )}
      </div>
      
      {lastMessage && (
        <div style={{ padding: '10px', borderTop: '1px solid #ddd', fontSize: '12px' }}>
          <strong>Last received message:</strong> {JSON.stringify(lastMessage).substring(0, 100)}...
        </div>
      )}
    </div>
  );
}

export default App;