import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Scale, Shield, Brain, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import logo from '@/assets/logo.png';

const Index = () => {
  const { t } = useTranslation(['common', 'disclaimer']);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img src={logo} alt="AI Legal Armenia" className="h-10 w-10 object-contain" />
            <h1 className="hidden text-xl font-bold sm:block">{t('common:app_name')}</h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LanguageSwitcher />
            <Button asChild size="sm">
              <Link to="/login">{t('common:login')}</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-4 py-8 sm:py-16">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 flex justify-center sm:mb-8">
            <img 
              src={logo} 
              alt="AI Legal Armenia" 
              className="h-24 w-24 object-contain sm:h-32 sm:w-32 lg:h-40 lg:w-40" 
            />
          </div>
          
          <h2 className="mb-4 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            {t('common:hero_title')}
          </h2>
          <p className="mb-6 text-base text-muted-foreground sm:mb-8 sm:text-lg lg:text-xl">
            {t('common:hero_subtitle')}
          </p>

          <div className="flex flex-col justify-center gap-3 sm:flex-row sm:gap-4">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link to="/login">
                {t('common:get_started')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

          {/* Features */}
          <div className="mt-12 grid gap-4 sm:gap-6 md:grid-cols-3 lg:mt-16">
            <div className="rounded-lg border bg-card p-4 transition-shadow hover:shadow-md sm:p-6">
              <div className="mb-3 flex justify-center sm:mb-4">
                <Shield className="h-8 w-8 text-primary sm:h-10 sm:w-10" />
              </div>
              <h3 className="mb-2 text-base font-semibold sm:text-lg">
                {t('common:feature_roles')}
              </h3>
              <p className="text-xs text-muted-foreground sm:text-sm">
                {t('common:feature_roles_desc')}
              </p>
            </div>

            <div className="rounded-lg border bg-card p-4 transition-shadow hover:shadow-md sm:p-6">
              <div className="mb-3 flex justify-center sm:mb-4">
                <Brain className="h-8 w-8 text-primary sm:h-10 sm:w-10" />
              </div>
              <h3 className="mb-2 text-base font-semibold sm:text-lg">
                {t('common:feature_analysis')}
              </h3>
              <p className="text-xs text-muted-foreground sm:text-sm">
                {t('common:feature_analysis_desc')}
              </p>
            </div>

            <div className="rounded-lg border bg-card p-4 transition-shadow hover:shadow-md sm:p-6">
              <div className="mb-3 flex justify-center sm:mb-4">
                <Scale className="h-8 w-8 text-primary sm:h-10 sm:w-10" />
              </div>
              <h3 className="mb-2 text-base font-semibold sm:text-lg">
                {t('common:feature_kb')}
              </h3>
              <p className="text-xs text-muted-foreground sm:text-sm">
                {t('common:feature_kb_desc')}
              </p>
            </div>
          </div>

          {/* Legal Disclaimer */}
          <div className="mt-8 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 sm:mt-12 sm:p-4">
            <p className="text-xs text-amber-700 dark:text-amber-400 sm:text-sm">
              ⚠️ {t('disclaimer:main')}
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-card py-6 sm:py-8">
        <div className="container mx-auto px-4 text-center text-xs text-muted-foreground sm:text-sm">
          <p>{t('common:copyright')}</p>
          <p className="mt-2">
            {t('disclaimer:ra_data_law')}
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
