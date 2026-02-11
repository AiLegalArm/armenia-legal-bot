import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { getSupabaseStorageKey } from '@/lib/supabase-storage-key';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

import { useToast } from '@/hooks/use-toast';
import { Scale, Loader2 } from 'lucide-react';

const loginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6),
});

type LoginValues = z.infer<typeof loginSchema>;

const Login = () => {
  const { t } = useTranslation(['auth', 'common', 'disclaimer']);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  
  const [rememberMe, setRememberMe] = useState(true);

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  const normalizeUsername = useMemo(
    () => (raw: string) => raw.trim().replace(/^@+/, '').toLowerCase(),
    []
  );

  const handleLogin = async (values: LoginValues) => {
    setIsLoading(true);
    try {
      // Canonicalize username (fixes issues with casing and accidental leading "@")
      const rawUsername = values.username.trim().replace(/^@+/, '');
      const username = normalizeUsername(values.username);

      // Convert username to internal email format
      const internalEmail = `${username}@app.internal`;
      const legacyInternalEmail = `${rawUsername}@app.internal`;
      
      const { error } = await supabase.auth.signInWithPassword({
        email: internalEmail,
        password: values.password,
      });

      // If an older account was created with different casing, retry once with the raw username.
      if (error && legacyInternalEmail !== internalEmail) {
        const { error: legacyError } = await supabase.auth.signInWithPassword({
          email: legacyInternalEmail,
          password: values.password,
        });
        if (legacyError) throw legacyError;
      } else if (error) {
        throw error;
      }
      
      // Handle "Remember me" preference
      if (!rememberMe) {
        // Move session to sessionStorage (expires on browser close)
        const sessionKey = getSupabaseStorageKey();
        const sessionData = localStorage.getItem(sessionKey);
        if (sessionData) {
          sessionStorage.setItem(sessionKey, sessionData);
          localStorage.removeItem(sessionKey);
        }
      }
      
      navigate('/dashboard');
    } catch (error) {
      toast({
        title: t('errors:login_failed', 'Login failed'),
        description: t('invalid_credentials', 'Invalid username or password'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Skip link for accessibility */}
      <a 
        href="#auth-form" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded"
      >
        {t('skip_to_form', 'Skip to login form')}
      </a>

      {/* Header */}
      <header className="border-b bg-card" role="banner">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Scale className="h-6 w-6 text-primary" aria-hidden="true" />
            <h1 className="text-xl font-bold">{t('common:app_name')}</h1>
          </div>
          <LanguageSwitcher />
        </div>
      </header>

      {/* Main Content */}
      <main 
        id="main-content" 
        className="container mx-auto flex flex-1 items-center justify-center px-4 py-8"
        role="main"
      >
        <Card className="w-full max-w-md" id="auth-form">
          <CardHeader className="text-center">
            <CardTitle>{t('welcome', 'Welcome')}</CardTitle>
            <CardDescription>
              {t('auth_description', 'Sign in to access your legal cases')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...loginForm}>
              <form 
                onSubmit={loginForm.handleSubmit(handleLogin)} 
                className="space-y-4"
                aria-label={t('login_form', 'Login form')}
              >
                <FormField
                  control={loginForm.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('username', 'Username')}</FormLabel>
                      <FormControl>
                        <Input 
                          type="text" 
                          autoComplete="username"
                          placeholder={t('username_placeholder', 'Enter your username')}
                          aria-describedby="login-username-error"
                          onChange={(e) => field.onChange(e.target.value)}
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage id="login-username-error" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={loginForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('password')}</FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          autoComplete="current-password"
                          aria-describedby="login-password-error"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage id="login-password-error" />
                    </FormItem>
                  )}
                />

                {/* Remember Me Checkbox */}
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="remember-me"
                    checked={rememberMe}
                    onCheckedChange={(checked) => setRememberMe(checked === true)}
                  />
                  <label 
                    htmlFor="remember-me" 
                    className="text-sm font-medium leading-none cursor-pointer"
                  >
                    {t('remember_me')}
                  </label>
                </div>
                
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={isLoading}
                  aria-busy={isLoading}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                  {t('login')}
                </Button>

                <div className="rounded-lg border bg-muted/50 p-4 text-center space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {t('contact_admin', 'Contact administrator for account access')}
                  </p>
                  <a 
                    href="tel:+37410123456" 
                    className="text-primary hover:underline flex items-center justify-center gap-2 text-sm"
                  >
                    <span>📞</span> +374 10 123 456
                  </a>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </main>

      {/* Footer with Disclaimer */}
      <footer className="border-t bg-card py-4" role="contentinfo">
        <div className="container mx-auto px-4">
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3" role="alert">
            <p className="text-center text-xs text-amber-700 dark:text-amber-400">
              ⚠️ {t('disclaimer:main')}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Login;
