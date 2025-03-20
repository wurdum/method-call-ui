// App.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
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

  // Define the callback function before using it in useEffect
  const addStackFrameToGraph = useCallback((stackFrameData) => {
    // Process incoming stack frame sequence
    const { sequence } = stackFrameData;
    const newNodes = [];
    const newEdges = [];

    // Create nodes for each stack frame
    sequence.forEach((frame, index) => {
      const nodeId = `${frame.file}-${frame.lineNumber}-${frame.structureName}-${frame.methodName}`.replace(/[^a-zA-Z0-9]/g, '_');
      
      // Check if node already exists
      const existingNode = elements.find(ele => ele.data && ele.data.id === nodeId);
      
      if (!existingNode) {
        newNodes.push({
          data: {
            id: nodeId,
            label: `${frame.file}:${frame.lineNumber}\n${frame.structureName}\n${frame.methodName}`,
            file: frame.file,
            lineNumber: frame.lineNumber,
            structureName: frame.structureName,
            methodName: frame.methodName,
            // Count for sizing nodes based on call frequency
            count: 1
          }
        });
      } else {
        // Update count for existing node
        const updatedElements = elements.map(ele => {
          if (ele.data && ele.data.id === nodeId) {
            return {
              ...ele,
              data: {
                ...ele.data,
                count: ele.data.count + 1
              }
            };
          }
          return ele;
        });
        
        setElements(updatedElements);
      }
      
      // Create edges between consecutive frames
      if (index < sequence.length - 1) {
        const nextFrame = sequence[index + 1];
        const nextNodeId = `${nextFrame.file}-${nextFrame.lineNumber}-${nextFrame.structureName}-${nextFrame.methodName}`.replace(/[^a-zA-Z0-9]/g, '_');
        const edgeId = `${nodeId}->${nextNodeId}`;
        
        // Check if edge already exists
        const existingEdge = elements.find(ele => ele.data && ele.data.id === edgeId);
        
        if (!existingEdge) {
          newEdges.push({
            data: {
              id: edgeId,
              source: nodeId,
              target: nextNodeId,
              count: 1
            }
          });
        } else {
          // Update count for existing edge
          const updatedElements = elements.map(ele => {
            if (ele.data && ele.data.id === edgeId) {
              return {
                ...ele,
                data: {
                  ...ele.data,
                  count: ele.data.count + 1
                }
              };
            }
            return ele;
          });
          
          setElements(updatedElements);
        }
      }
    });

    // Update graph with new elements
    setElements(prevElements => [...prevElements, ...newNodes, ...newEdges]);
  }, [elements]);

  useEffect(() => {
    // Connect to WebSocket server
    socketRef.current = io('http://localhost:3001');

    // Listen for new stack frame sequences
    socketRef.current.on('newStackFrame', (data) => {
      console.log('Received new stack frame via WebSocket:', data);
      addStackFrameToGraph(data);
    });

    // Listen for connection event
    socketRef.current.on('connect', () => {
      console.log('Connected to WebSocket server with ID:', socketRef.current.id);
    });

    // Listen for disconnect event
    socketRef.current.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
    });

    // Listen for connection error
    socketRef.current.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
    });

    // Clean up on unmount
    return () => socketRef.current.disconnect();
  }, [addStackFrameToGraph]);

  const cytoscapeStylesheet = [
    {
      selector: 'node',
      style: {
        'background-color': '#6FB1FC',
        'label': 'data(label)',
        'text-wrap': 'wrap',
        'text-max-width': '100px',
        'width': ele => 50 + (ele.data('count') * 5),
        'height': ele => 50 + (ele.data('count') * 5),
        'font-size': '10px',
        'text-valign': 'center',
        'text-halign': 'center'
      }
    },
    {
      selector: 'edge',
      style: {
        'width': ele => 1 + (ele.data('count') * 0.5),
        'line-color': '#ccc',
        'target-arrow-color': '#ccc',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier'
      }
    }
  ];

  const layout = {
    name: 'dagre',
    rankDir: 'TB',
    nodeSep: 80,
    rankSep: 100,
    animate: true,
    animationDuration: 300
  };

  // Add a test button to verify the graph functionality works
  return (
    <div style={{ height: '100vh', width: '100%' }}>
      <h1>Real-time Method Call Visualization</h1>
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
        style={{ margin: '10px', padding: '8px 16px' }}
      >
        Add Test Nodes
      </button>
      <div style={{ height: 'calc(100% - 100px)', width: '100%', border: '1px solid #ddd' }}>
        <CytoscapeComponent
          elements={elements}
          stylesheet={cytoscapeStylesheet}
          layout={layout}
          cy={cy => (cyRef.current = cy)}
          wheelSensitivity={0.1}
        />
      </div>
    </div>
  );
}

export default App;