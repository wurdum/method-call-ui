// App.js
import React, { useState, useEffect, useRef } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import io from 'socket.io-client';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';

// Register the dagre layout with cytoscape
cytoscape.use(dagre);

function App() {
  const [elements, setElements] = useState([]);
  const cyRef = useRef(null);
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);

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
      return `calls: ${count}\n${file}:${lineNumber}\n${structureName}:${methodName}()`;
    };
    
    // Create nodes for each stack frame
    sequence.forEach((frame, index) => {
      const nodeId = `${frame.file}-${frame.lineNumber}-${frame.structureName}-${frame.methodName}`.replace(/[^a-zA-Z0-9]/g, '_');
      
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
        const nextNodeId = `${nextFrame.file}-${nextFrame.lineNumber}-${nextFrame.structureName}-${nextFrame.methodName}`.replace(/[^a-zA-Z0-9]/g, '_');
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
        rankDir: 'TB',
        nodeSep: 120,
        rankSep: 40,
        animate: true,
        animationDuration: 300
      }).run();
    }
  }, [elements]);

  const cytoscapeStylesheet = [
    {
      selector: 'node',
      style: {
        'background-opacity': 0,           // Make background fully transparent
        'background-color': '#ffffff',     // Set a background color (won't be visible due to opacity)
        'border-width': 1,                 // Add a border width
        'border-color': '#888',            // Grey border color
        'label': 'data(label)',
        'text-wrap': 'wrap',
        'text-max-width': '200px',         // Maximum text width before wrapping
        'line-height': 1.5,                // Increase line spacing
        'width': 'label',                  // Width based on label content
        'height': 'label',                 // Height based on label content
        'padding': '10px',                 // Add padding around text
        'font-size': '10px',
        'text-valign': 'center',
        'text-halign': 'center',
        'shape': 'round-rectangle',
        'border-radius': 8
      }
    },
    // Node styles based on count
    {
      selector: 'node[count > 1][count <= 5]',
      style: {
        'border-width': 2,  // Slightly thicker border for counts 2-5
        'border-color': '#666'  // Slightly darker border
      }
    },
    {
      selector: 'node[count > 5][count <= 10]',
      style: {
        'border-width': 3,  // Medium thick border for counts 6-10
        'border-color': '#444'  // Darker border
      }
    },
    {
      selector: 'node[count > 10]',
      style: {
        'border-width': 4,  // Thick border for counts over 10
        'border-color': '#222'  // Very dark border
      }
    },
    {
      selector: 'edge',
      style: {
        'width': 'data(count)',  // Base width on count
        'line-color': '#ccc',
        'target-arrow-color': '#ccc',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier'
      }
    },
    // You can add more specific selectors for different count ranges
    {
      selector: 'edge[count <= 1]',
      style: {
        'width': 1  // Default width for count 1
      }
    },
    {
      selector: 'edge[count > 1][count <= 5]',
      style: {
        'width': 3  // Medium width for counts 2-5
      }
    },
    {
      selector: 'edge[count > 5][count <= 10]',
      style: {
        'width': 5  // Thicker for counts 6-10
      }
    },
    {
      selector: 'edge[count > 10]',
      style: {
        'width': 7,  // Very thick for counts over 10
        'line-color': '#ff9999'  // Optional: different color for high-traffic edges
      }
    },
  ];

  // Add a test button and debug info
  return (
    <div style={{ height: '100vh', width: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px', borderBottom: '1px solid #ddd' }}>
        <h1>Real-time Method Call Visualization</h1>
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
              rankDir: 'TB',
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