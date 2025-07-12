import type { Route } from "./+types/users";

export async function loader({ request }: Route.LoaderArgs) {
  const users = [
    { id: 1, name: "John Doe", email: "john@example.com", role: "admin" },
    { id: 2, name: "Jane Smith", email: "jane@example.com", role: "user" },
    { id: 3, name: "Bob Johnson", email: "bob@example.com", role: "user" },
    { id: 4, name: "Alice Williams", email: "alice@example.com", role: "moderator" }
  ];

  return Response.json({ users }, {
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function action({ request }: Route.ActionArgs) {
  const method = request.method;
  
  if (method === "POST") {
    const body = await request.json();
    
    const newUser = {
      id: Date.now(),
      name: body.name,
      email: body.email,
      role: body.role || "user"
    };
    
    return Response.json({ 
      message: "User created successfully", 
      user: newUser 
    }, {
      status: 201,
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