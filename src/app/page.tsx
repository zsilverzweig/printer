import { WelcomePage } from "@/lib/components/welcome-page";

/**
 * Home page that shows welcome page content
 * The AppRouter component will override this for authenticated users
 */
export default function HomePage() {
  return <WelcomePage />;
}
