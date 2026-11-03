import type { NextConfig } from "next";

// Container builds explicitly point at the private Python service. Vercel
// keeps using its Python function when this optional setting is absent.
const pythonApiOrigin = process.env.AIX_PYTHON_API_ORIGIN?.replace(/\/$/, "");
const nextConfig: NextConfig = {
  rewrites: async () => [
    {
      source: "/api/py/:path*",
      destination:
        pythonApiOrigin
          ? `${pythonApiOrigin}/api/py/:path*`
          : process.env.NODE_ENV === "development"
          ? "http://127.0.0.1:8000/api/py/:path*"
          : "/api/",
    },
  ],
};

export default nextConfig;
