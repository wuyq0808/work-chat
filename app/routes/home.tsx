import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Slack Assistant" },
    { name: "description", content: "Your intelligent companion for enhanced Slack productivity" },
  ];
}

export default function Home() {
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-4xl font-bold text-gray-900 mb-6">Welcome to Slack Assistant</h1>
      <p className="text-lg text-gray-600 mb-8">
        Your intelligent companion for enhanced Slack productivity and team collaboration.
      </p>
      
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">Quick Start</h2>
          <p className="text-gray-600 mb-4">
            Get started with Slack Assistant in minutes. Connect your workspace and start
            automating your workflows.
          </p>
          <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition">
            Get Started
          </button>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">API Documentation</h2>
          <p className="text-gray-600 mb-4">
            Explore our RESTful API to integrate Slack Assistant with your applications.
          </p>
          <button className="bg-gray-800 text-white px-4 py-2 rounded hover:bg-gray-900 transition">
            View API Docs
          </button>
        </div>
      </div>
      
      <div className="mt-12 bg-blue-50 p-6 rounded-lg">
        <h2 className="text-2xl font-semibold text-gray-800 mb-3">API Endpoints</h2>
        <div className="space-y-2">
          <div className="font-mono text-sm">
            <span className="text-green-600">GET</span> /api/users - Get all users
          </div>
          <div className="font-mono text-sm">
            <span className="text-green-600">GET</span> /api/messages - Get messages
          </div>
          <div className="font-mono text-sm">
            <span className="text-blue-600">POST</span> /api/messages - Send a message
          </div>
        </div>
      </div>
    </div>
  );
}
