import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  layout("routes/layout.tsx", [
    index("routes/home.tsx"),
    route("about", "routes/about.tsx"),
    route("api/users", "routes/api/users.tsx"),
    route("api/messages", "routes/api/messages.tsx"),
  ])
] satisfies RouteConfig;
