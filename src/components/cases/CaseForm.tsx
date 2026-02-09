import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { CaseFormFileUpload } from './CaseFormFileUpload';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, CalendarIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Database } from '@/integrations/supabase/types';

type Case = Database['public']['Tables']['cases']['Row'];
type CaseInsert = Database['public']['Tables']['cases']['Insert'];

// Stage definitions - unified for all case types as per requirements
const CASE_STAGES = [
  { value: 'preliminary', label: 'stage_1' },
  { value: 'first_instance', label: 'stage_2' },
  { value: 'appeal', label: 'stage_3' },
  { value: 'cassation', label: 'stage_4' },
] as const;

// Court list as per requirements
const COURTS = [
  { value: 'Սահմանադրական դատարան', label: 'court_constitutional' },
  { value: 'Վճռաբեկ դատարան', label: 'court_cassation' },
  { value: 'Վերաքննիչ քաղաքացիական դատարան', label: 'court_civil_appeal' },
  { value: 'Վերաքննիչ քրեական դատարան', label: 'court_criminal_appeal' },
  { value: 'Վերաքննիչ վարչական դատարան', label: 'court_administrative_appeal' },
  { value: 'Հակակոռուպցիոն դատարան', label: 'court_anticorruption' },
  { value: 'Հակակոռուպցիոն վերաքննիչ դատարան', label: 'court_anticorruption_appeal' },
  { value: 'Վարչական դատարան', label: 'court_administrative' },
  { value: 'Երևան քաղաքի ընդհանուր իրավասության քրեական դատարան', label: 'court_yerevan_criminal' },
  { value: 'Երևան քաղաքի ընդհանուր իրավասության քաղաքացիական դատարան', label: 'court_yerevan_civil' },
  { value: 'Արագածոտնի մարզի ընդհանուր իրավասության դատարան', label: 'court_aragatsotn' },
  { value: 'Արարատի և Վայոց ձորի մարզերի ընդհանուր իրավասության դատարան', label: 'court_ararat_vayots_dzor' },
  { value: 'Գեղարքունիքի մարզի ընդհանուր իրավասության դատարան', label: 'court_gegharkunik' },
  { value: 'Լոռու մարզի ընդհանուր իրավասության դատարան', label: 'court_lori' },
  { value: 'Կոտայքի մարզի ընդհանուր իրավասության դատարան', label: 'court_kotayk' },
  { value: 'Շիրակի մարզի ընդհանուր իրավասության դատարան', label: 'court_shirak' },
  { value: 'Սյունիքի մարզի ընդհանուր իրավասության դատարան', label: 'court_syunik' },
  { value: 'Տավուշի մարզի ընդհանուր իրավասության դատարան', label: 'court_tavush' },
  { value: 'Արմավիրի մարզի ընդհանուր իրավասության դատարան', label: 'court_armavir' },
] as const;

interface CaseFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CaseInsert, files?: File[]) => void;
  initialData?: Case | null;
  isLoading?: boolean;
}

export function CaseForm({ 
  open, 
  onOpenChange, 
  onSubmit, 
  initialData,
  isLoading 
}: CaseFormProps) {
  const { t } = useTranslation('cases');
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const caseFormSchema = z.object({
    case_number: z.string().min(1, 'Required'),
    title: z.string().min(1, 'Required'),
    description: z.string().optional(),
    case_type: z.enum(['criminal', 'civil', 'administrative'], {
      required_error: t('case_type_required'),
    }),
    party_role: z.enum(['claimant', 'defendant'], {
      required_error: t('party_role_required'),
    }),
    appeal_party_role: z.enum(['appellant', 'respondent']).optional(),
    current_stage: z.string().min(1, t('stage_required')),
    status: z.enum(['open', 'in_progress', 'pending', 'closed', 'archived']),
    priority: z.enum(['low', 'medium', 'high', 'urgent']),
    court_name: z.string().min(1, t('court_required')),
    court_date: z.string().optional(),
    notes: z.string().optional(),
  });

  type CaseFormValues = z.infer<typeof caseFormSchema>;

  const form = useForm<CaseFormValues>({
    resolver: zodResolver(caseFormSchema),
    defaultValues: {
      case_number: '',
      title: '',
      description: '',
      case_type: 'criminal',
      party_role: undefined,
      appeal_party_role: undefined,
      current_stage: 'preliminary',
      status: 'open',
      priority: 'medium',
      court_name: '',
      court_date: '',
      notes: '',
    },
  });

  useEffect(() => {
    if (initialData) {
      const courtDate = initialData.court_date 
        ? new Date(initialData.court_date)
        : undefined;
      
      setSelectedDate(courtDate);
      
      const caseType = (initialData.case_type || 'criminal') as Database["public"]["Enums"]["case_type"];
      const currentStage = initialData.current_stage || 'preliminary';
      
      // Backward compatibility: if court exists but court_name doesn't, use court
      const courtName = initialData.court_name || initialData.court || '';
      
      form.reset({
        case_number: initialData.case_number,
        title: initialData.title,
        description: initialData.description || '',
        case_type: caseType,
        party_role: (initialData.party_role as 'claimant' | 'defendant') || undefined,
        appeal_party_role: (initialData.appeal_party_role as 'appellant' | 'respondent') || undefined,
        current_stage: currentStage,
        status: initialData.status,
        priority: initialData.priority,
        court_name: courtName,
        court_date: initialData.court_date 
          ? new Date(initialData.court_date).toISOString().split('T')[0] 
          : '',
        notes: initialData.notes || '',
      });
    } else {
      setSelectedDate(undefined);
      setPendingFiles([]);
      form.reset({
        case_number: '',
        title: '',
        description: '',
        case_type: 'criminal',
        party_role: undefined,
        appeal_party_role: undefined,
        current_stage: 'preliminary',
        status: 'open',
        priority: 'medium',
        court_name: '',
        court_date: '',
        notes: '',
      });
    }
  }, [initialData, form]);

  const handleSubmit = (values: CaseFormValues) => {
    onSubmit({
      case_number: values.case_number,
      title: values.title,
      case_type: values.case_type,
      party_role: values.party_role,
      appeal_party_role: values.appeal_party_role || null,
      current_stage: values.current_stage,
      court: values.court_name || null,
      status: values.status,
      priority: values.priority,
      court_date: values.court_date ? new Date(values.court_date).toISOString() : null,
      description: values.description || null,
      court_name: values.court_name || null,
      notes: values.notes || null,
    }, pendingFiles.length > 0 ? pendingFiles : undefined);
    
    setPendingFiles([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {initialData ? t('edit_case') : t('new_case')}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="case_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('case_number')}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="ԳԴ-2024-001" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('case_title')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="case_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('case_type')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('select_case_type')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="criminal">{t('type_criminal')}</SelectItem>
                        <SelectItem value="civil">{t('type_civil')}</SelectItem>
                        <SelectItem value="administrative">{t('type_administrative')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="party_role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('party_role')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('select_party_role')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="claimant">{t('party_role_claimant')}</SelectItem>
                        <SelectItem value="defendant">{t('party_role_defendant')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="current_stage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('current_stage')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('select_stage')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CASE_STAGES.map((stage) => (
                          <SelectItem key={stage.value} value={stage.value}>
                            {t(stage.label)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="appeal_party_role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('appeal_party_role')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('select_appeal_party_role')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="appellant">{t('appeal_role_appellant')}</SelectItem>
                        <SelectItem value="respondent">{t('appeal_role_respondent')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="court_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('court_name')}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('select_court')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {COURTS.map((court) => (
                        <SelectItem key={court.value} value={court.value}>
                          {t(court.label)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('description')}</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />


            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('status')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="open">{t('status_open')}</SelectItem>
                        <SelectItem value="in_progress">{t('status_in_progress')}</SelectItem>
                        <SelectItem value="pending">{t('status_pending')}</SelectItem>
                        <SelectItem value="closed">{t('status_closed')}</SelectItem>
                        <SelectItem value="archived">{t('status_archived')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('priority')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="low">{t('priority_low')}</SelectItem>
                        <SelectItem value="medium">{t('priority_medium')}</SelectItem>
                        <SelectItem value="high">{t('priority_high')}</SelectItem>
                        <SelectItem value="urgent">{t('priority_urgent')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="court_date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>{t('court_date')}</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(new Date(field.value), "PPP")
                          ) : (
                            <span>{t('pick_date')}</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value ? new Date(field.value) : undefined}
                        onSelect={(date) => {
                          if (date) {
                            const formattedDate = format(date, 'yyyy-MM-dd');
                            field.onChange(formattedDate);
                            setSelectedDate(date);
                          } else {
                            field.onChange('');
                            setSelectedDate(undefined);
                          }
                        }}
                        disabled={(date) =>
                          date < new Date(new Date().setHours(0, 0, 0, 0))
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('notes')}</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* File Upload Section - only for new cases */}
            {!initialData && (
              <CaseFormFileUpload 
                files={pendingFiles} 
                onFilesChange={setPendingFiles} 
              />
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
              >
                {t('common:cancel')}
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('common:save')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
