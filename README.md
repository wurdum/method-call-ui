# Method Call Visualizer

A real-time visualization tool for tracking and displaying method call sequences in your applications.

## Overview

This application visualizes the call stack of your application by showing method calls as nodes and their relationships as edges in a directed graph. It provides a real-time view of how methods call each other, helping you understand the flow of your application.

## Features

- Real-time visualization of method call sequences
- Heat map coloring based on call frequency
- Vertical and horizontal layout options
- Export to Mermaid markdown format
- Simple REST API for sending call stack data

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

Clone the repository and install dependencies:

```bash
# Clone the repository
git clone https://github.com/wurdum/method-call-visualizer.git
cd method-call-visualizer

# Install backend dependencies
cd be
npm install

# Install frontend dependencies
cd ../fe
npm install
```

### Running the Application

You need to start both the backend and frontend servers:

#### Start the backend server

```bash
cd be
node server.js
```

The backend server will start on port 3001.

#### Start the frontend application

```bash
cd fe
npm start
```

The frontend will start on port 3000. Open [http://localhost:3000](http://localhost:3000) in your browser to view the application.

## Sending Data to the Visualizer

You can send method call sequences to the visualizer using a simple HTTP POST request:

### Using curl

```bash
curl -X POST http://localhost:3001/api/stackframes \
  -H "Content-Type: application/json" \
  -d @payload-example.json
```

Or provide the JSON inline:

```bash
curl -X POST http://localhost:3001/api/stackframes \
  -H "Content-Type: application/json" \
  -d '{
    "sequence": [
      {
        "file": "app.js",
        "lineNumber": 25,
        "structureName": "UserController",
        "methodName": "authenticate"
      },
      {
        "file": "auth.js",
        "lineNumber": 47,
        "structureName": "AuthService",
        "methodName": "verifyCredentials"
      }
    ]
  }'
```

### JSON Payload Format

The API expects a JSON payload with a `sequence` array containing method call information:

```json
{
  "sequence": [
    {
      "file": "filename.js",
      "lineNumber": 25,
      "structureName": "ClassName",
      "methodName": "methodName"
    },
    // Additional method calls in sequence
  ],
  "timestamp": "2023-03-20T14:35:27.892Z",  // Optional
  "traceId": "trace-123456"                 // Optional
}
```

The methods in the sequence should be ordered from the outermost caller to the innermost callee.

## Integration with Your Application

To integrate with your application, instrument your code to send method call sequences to the API endpoint whenever a relevant execution path completes. Check `callstack-handler.go` for an example of how to send method call sequences from a Go application.
