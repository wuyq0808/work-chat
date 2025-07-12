export default function About() {
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-4">About Slack Assistant</h1>
      <div className="prose prose-lg text-gray-600">
        <p>
          Slack Assistant is a powerful tool designed to help teams collaborate more effectively
          through intelligent automation and assistance within Slack.
        </p>
        <h2 className="text-2xl font-semibold text-gray-800 mt-6 mb-3">Features</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>Automated message handling and responses</li>
          <li>Team productivity analytics</li>
          <li>Smart notifications and reminders</li>
          <li>Integration with popular tools and services</li>
        </ul>
        <h2 className="text-2xl font-semibold text-gray-800 mt-6 mb-3">API Integration</h2>
        <p>
          Our API endpoints allow you to integrate Slack Assistant with your existing tools
          and workflows. Check out our API documentation for more details.
        </p>
      </div>
    </div>
  );
}