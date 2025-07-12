import { Outlet, Link, useLocation } from "react-router";

export default function Layout() {
  const location = useLocation();
  
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">Slack Assistant</h1>
            </div>
            <div className="flex space-x-8">
              <Link 
                to="/" 
                className={`inline-flex items-center px-1 pt-1 text-sm font-medium ${
                  location.pathname === '/' 
                    ? 'text-blue-600 border-b-2 border-blue-600' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Home
              </Link>
              <Link 
                to="/about" 
                className={`inline-flex items-center px-1 pt-1 text-sm font-medium ${
                  location.pathname === '/about' 
                    ? 'text-blue-600 border-b-2 border-blue-600' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                About
              </Link>
            </div>
          </div>
        </div>
      </nav>
      
      <main className="container mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}