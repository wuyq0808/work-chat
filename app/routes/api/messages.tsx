import type { Route } from "./+types/messages";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const channel = url.searchParams.get("channel");
  const limit = url.searchParams.get("limit") || "50";
  
  const messages = [
    {
      id: 1,
      channel: "general",
      user: "John Doe",
      text: "Hey team, how's everyone doing today?",
      timestamp: "2025-01-12T10:30:00Z"
    },
    {
      id: 2,
      channel: "general",
      user: "Jane Smith",
      text: "Doing great! Just finished the new feature.",
      timestamp: "2025-01-12T10:32:00Z"
    },
    {
      id: 3,
      channel: "development",
      user: "Bob Johnson",
      text: "Can someone review my PR?",
      timestamp: "2025-01-12T11:00:00Z"
    },
    {
      id: 4,
      channel: "development",
      user: "Alice Williams",
      text: "I'll take a look at it now.",
      timestamp: "2025-01-12T11:05:00Z"
    }
  ];
  
  let filteredMessages = messages;
  if (channel) {
    filteredMessages = messages.filter(msg => msg.channel === channel);
  }
  
  filteredMessages = filteredMessages.slice(0, parseInt(limit));
  
  return Response.json({ 
    messages: filteredMessages,
    total: filteredMessages.length,
    channel: channel || "all"
  }, {
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function action({ request }: Route.ActionArgs) {
  const method = request.method;
  
  if (method === "POST") {
    const body = await request.json();
    
    if (!body.channel || !body.text) {
      return Response.json({ 
        error: "Channel and text are required" 
      }, { 
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }
    
    const newMessage = {
      id: Date.now(),
      channel: body.channel,
      user: body.user || "Anonymous",
      text: body.text,
      timestamp: new Date().toISOString()
    };
    
    return Response.json({ 
      message: "Message sent successfully", 
      data: newMessage 
    }, {
      status: 201,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
  
  if (method === "DELETE") {
    const body = await request.json();
    
    if (!body.id) {
      return Response.json({ 
        error: "Message ID is required" 
      }, { 
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }
    
    return Response.json({ 
      message: "Message deleted successfully",
      id: body.id
    }, {
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
  
  return Response.json({ error: "Method not allowed" }, { 
    status: 405,
    headers: {
      "Content-Type": "application/json",
    },
  });
}