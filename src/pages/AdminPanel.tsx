import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BookOpen,
  BarChart3,
  Database as DatabaseIcon,
  Users,
  Users2,
  MessageSquare,
  FileCode2
} from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminKnowledgeBaseTab } from "@/components/admin/AdminKnowledgeBaseTab";
import { LegalPracticeKB } from "@/components/admin/LegalPracticeKB";
import { UserManagement } from "@/components/admin/UserManagement";
import { TeamManagement } from "@/components/admin/TeamManagement";
import { UserFeedback } from "@/components/admin/UserFeedback";
import { PromptManager } from "@/components/admin/PromptManager";
import { UsageMonitor } from "@/components/UsageMonitor";

const AdminPanel = () => {
  const navigate = useNavigate();
  const { user, signOut, isAdmin, loading: authLoading } = useAuth();

  // Protect admin route
  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      navigate("/admin/login");
    }
  }, [user, isAdmin, authLoading, navigate]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/admin/login");
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Don't render if not admin
  if (!user || !isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader email={user.email || ""} onSignOut={handleSignOut} />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="kb" className="space-y-6">
          <TabsList className="h-auto flex-wrap gap-1 p-1">
            <TabsTrigger value="kb" className="gap-1.5 px-2 py-1.5 text-xs sm:px-3 sm:text-sm">
              <DatabaseIcon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{"\u0533\u056B\u057F\u0565\u056C\u056B\u0584\u0576\u0565\u0580\u056B \u0562\u0561\u0566\u0561"}</span>
            </TabsTrigger>
            <TabsTrigger value="practice" className="gap-1.5 px-2 py-1.5 text-xs sm:px-3 sm:text-sm">
              <BookOpen className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{"\u054A\u0580\u0561\u056F\u057F\u056B\u056F\u0561 (KB)"}</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-1.5 px-2 py-1.5 text-xs sm:px-3 sm:text-sm">
              <Users className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{"\u0555\u0563\u057F\u0561\u057F\u0565\u0580\u0576\u0565\u0580"}</span>
            </TabsTrigger>
            <TabsTrigger value="teams" className="gap-1.5 px-2 py-1.5 text-xs sm:px-3 sm:text-sm">
              <Users2 className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{"\u0539\u056B\u0574\u0565\u0580"}</span>
            </TabsTrigger>
            <TabsTrigger value="feedback" className="gap-1.5 px-2 py-1.5 text-xs sm:px-3 sm:text-sm">
              <MessageSquare className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{"\u053F\u0561\u0580\u056E\u056B\u0584\u0576\u0565\u0580"}</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-1.5 px-2 py-1.5 text-xs sm:px-3 sm:text-sm">
              <BarChart3 className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{"\u054E\u056B\u0573\u0561\u056F\u0561\u0563\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576"}</span>
            </TabsTrigger>
            <TabsTrigger value="prompts" className="gap-1.5 px-2 py-1.5 text-xs sm:px-3 sm:text-sm">
              <FileCode2 className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Prompts</span>
            </TabsTrigger>
          </TabsList>

          {/* Knowledge Base Tab */}
          <TabsContent value="kb" className="space-y-6">
            <AdminKnowledgeBaseTab />
          </TabsContent>

          {/* Legal Practice KB Tab */}
          <TabsContent value="practice">
            <LegalPracticeKB />
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users">
            <UserManagement />
          </TabsContent>

          {/* Teams Tab */}
          <TabsContent value="teams">
            <TeamManagement />
          </TabsContent>

          {/* User Feedback Tab */}
          <TabsContent value="feedback">
            <UserFeedback />
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics">
            <UsageMonitor budgetLimit={10.0} compact={false} />
          </TabsContent>

          {/* Prompts Tab */}
          <TabsContent value="prompts">
            <PromptManager />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminPanel;
