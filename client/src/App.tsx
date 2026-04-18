import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import BottomNav from "./components/BottomNav";
import { useAuth } from "./_core/hooks/useAuth";
import Home from "./pages/Home";
import Sessions from "./pages/Sessions";
import Login from "./pages/Login";
import SessionDetail from "./pages/SessionDetail";
import SignUpForm from "./pages/SignUpForm";
import Profile from "./pages/Profile";
import Payments from "./pages/Payments";
import Membership from "./pages/Membership";
import Admin from "./pages/Admin";
import Splits from "./pages/Splits";
import Announcements from "./pages/Announcements";
import FunResources from "./pages/FunResources";
import FunResourcesPolicies from "./pages/FunResourcesPolicies";
import FunResourcesInvite from "./pages/FunResourcesInvite";
import FunResourcesMerch from "./pages/FunResourcesMerch";
import FunResourcesResources from "./pages/FunResourcesResources";
import FunResourcesVideos from "./pages/FunResourcesVideos";
import NewToClub from "./pages/NewToClub";

const NO_NAV_PATHS = ["/login"];

function AppShell() {
  const [location] = useLocation();
  const { isAuthenticated } = useAuth();
  const showNav = isAuthenticated && !NO_NAV_PATHS.includes(location);

  return (
    <>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/sessions" component={Sessions} />
        <Route path="/login" component={Login} />
        <Route path="/session/:rowId/splits" component={Splits} />
        <Route path="/session/:rowId" component={SessionDetail} />
        <Route path="/signup/:rowId" component={SignUpForm} />
        <Route path="/payments" component={Payments} />
        <Route path="/membership" component={Membership} />
        <Route path="/admin" component={Admin} />
        <Route path="/profile" component={Profile} />
        <Route path="/announcements" component={Announcements} />
        <Route path="/fun-resources" component={FunResources} />
        <Route path="/fun-resources/policies" component={FunResourcesPolicies} />
        <Route path="/fun-resources/invite" component={FunResourcesInvite} />
        <Route path="/fun-resources/merch" component={FunResourcesMerch} />
        <Route path="/fun-resources/resources" component={FunResourcesResources} />
        <Route path="/fun-resources/videos" component={FunResourcesVideos} />
        <Route path="/newbie" component={NewToClub} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
      {showNav && <BottomNav />}
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <AppShell />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
