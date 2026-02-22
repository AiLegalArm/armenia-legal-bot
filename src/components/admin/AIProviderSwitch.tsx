import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Cpu, Cloud } from "lucide-react";
import { toast } from "sonner";

type AIProvider = "gateway" | "openai";

export function AIProviderSwitch() {
  const [provider, setProvider] = useState<AIProvider>("gateway");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProvider();
  }, []);

  const loadProvider = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("app_settings")
        .select("value")
        .eq("key", "ai_provider")
        .single();

      if (!error && data) {
        setProvider((data as any).value === "openai" ? "openai" : "gateway");
      }
    } catch {
      // table might not exist yet
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (checked: boolean) => {
    const newProvider: AIProvider = checked ? "openai" : "gateway";
    setSaving(true);

    try {
      const { error } = await (supabase as any)
        .from("app_settings")
        .upsert(
          { key: "ai_provider", value: newProvider, updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );

      if (error) {
        toast.error("Ошибка сохранения: " + error.message);
        return;
      }

      setProvider(newProvider);
      toast.success(
        newProvider === "openai"
          ? "Переключено на прямой OpenAI API"
          : "Переключено на Основной шлюз (Gateway)"
      );
    } catch (err) {
      toast.error("Не удалось сохранить настройку");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Cpu className="h-4 w-4" />
          Провайдер ИИ
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <Label htmlFor="ai-provider-switch" className="text-sm font-medium">
                {provider === "gateway" ? "Основной (Gateway)" : "OpenAI (прямой API)"}
              </Label>
              <Badge variant={provider === "openai" ? "default" : "secondary"}>
                {provider === "openai" ? (
                  <><Cpu className="h-3 w-3 mr-1" /> OpenAI</>
                ) : (
                  <><Cloud className="h-3 w-3 mr-1" /> Gateway</>
                )}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {provider === "gateway"
                ? "Запросы идут через Lovable AI Gateway (основные модели)"
                : "OpenAI-модели вызываются напрямую через api.openai.com"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            <Switch
              id="ai-provider-switch"
              checked={provider === "openai"}
              onCheckedChange={handleToggle}
              disabled={saving}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
