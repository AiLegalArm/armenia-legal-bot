import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Scale, ArrowLeft, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { NotificationBell } from '@/components/reminders';

interface CaseDetailHeaderProps {
  userEmail?: string;
  onSignOut: () => void;
}

export function CaseDetailHeader({ userEmail, onSignOut }: CaseDetailHeaderProps) {
  const { t } = useTranslation(['common']);
  const navigate = useNavigate();

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-card">
        <div className="container mx-auto flex h-14 sm:h-16 items-center justify-between px-3 sm:px-4">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            <h1 className="text-lg sm:text-xl font-bold hidden sm:block">{t('common:app_name')}</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="hidden sm:block text-sm text-muted-foreground truncate max-w-[120px]">
              {userEmail}
            </span>
            <NotificationBell />
            <LanguageSwitcher />
            <Button variant="ghost" size="icon" onClick={onSignOut}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Back Button */}
      <div className="container mx-auto px-4 pt-6">
        <Button variant="ghost" className="mb-4" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('common:back', 'Back')}
        </Button>
      </div>
    </>
  );
}
