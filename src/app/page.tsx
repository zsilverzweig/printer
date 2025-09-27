import { WelcomePage } from "@/lib/components/welcome-page";

/**
 * Home page that shows welcome page content
 * Middleware and AppLayout will handle routing for authenticated users
 */
export default function HomePage() {
  return <WelcomePage />;
}
