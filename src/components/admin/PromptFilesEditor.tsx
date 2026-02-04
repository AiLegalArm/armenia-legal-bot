import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  FileCode, 
  ChevronDown, 
  ChevronRight, 
  Copy, 
  Check,
  Languages,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';

// All prompt files in the project
const PROMPT_FILES = [
  {
    category: 'AI Analyze',
    files: [
      { path: 'supabase/functions/ai-analyze/prompts/defense.ts', name: 'Defense Prompt' },
      { path: 'supabase/functions/ai-analyze/prompts/prosecution.ts', name: 'Prosecution Prompt' },
      { path: 'supabase/functions/ai-analyze/prompts/judge.ts', name: 'Judge Prompt' },
      { path: 'supabase/functions/ai-analyze/prompts/aggregator.ts', name: 'Aggregator Prompt' },
      { path: 'supabase/functions/ai-analyze/prompts/evidence.ts', name: 'Evidence Prompt' },
      { path: 'supabase/functions/ai-analyze/prompts/procedural.ts', name: 'Procedural Prompt' },
      { path: 'supabase/functions/ai-analyze/prompts/qualification.ts', name: 'Qualification Prompt' },
      { path: 'supabase/functions/ai-analyze/prompts/rights.ts', name: 'Rights Prompt' },
      { path: 'supabase/functions/ai-analyze/prompts/substantive.ts', name: 'Substantive Prompt' },
      { path: 'supabase/functions/ai-analyze/system.ts', name: 'System Prompts' },
      { path: 'supabase/functions/ai-analyze/legal-practice-kb.ts', name: 'KB Usage Instructions' },
    ]
  },
  {
    category: 'Document Generation',
    files: [
      { path: 'supabase/functions/generate-document/prompts/general.ts', name: 'General Prompts' },
      { path: 'supabase/functions/generate-document/prompts/civil.ts', name: 'Civil Prompts' },
      { path: 'supabase/functions/generate-document/prompts/criminal.ts', name: 'Criminal Prompts' },
      { path: 'supabase/functions/generate-document/prompts/administrative.ts', name: 'Administrative Prompts' },
      { path: 'supabase/functions/generate-document/prompts/echr.ts', name: 'ECHR Prompts' },
      { path: 'supabase/functions/generate-document/prompts/fallback.ts', name: 'Fallback Prompts' },
      { path: 'supabase/functions/generate-document/prompts/role-prompts.ts', name: 'Role Prompts' },
      { path: 'supabase/functions/generate-document/system-prompts.ts', name: 'System Prompts' },
    ]
  },
  {
    category: 'Complaint Generation',
    files: [
      { path: 'supabase/functions/generate-complaint/prompts/system-prompt.ts', name: 'System Prompt' },
      { path: 'supabase/functions/generate-complaint/prompts/court-instructions.ts', name: 'Court Instructions' },
      { path: 'supabase/functions/generate-complaint/prompts/language-instructions.ts', name: 'Language Instructions' },
    ]
  },
  {
    category: 'Other Functions',
    files: [
      { path: 'supabase/functions/legal-chat/index.ts', name: 'Legal Chat' },
      { path: 'supabase/functions/ocr-process/index.ts', name: 'OCR Process' },
      { path: 'supabase/functions/audio-transcribe/index.ts', name: 'Audio Transcribe' },
      { path: 'supabase/functions/extract-case-fields/index.ts', name: 'Extract Case Fields' },
    ]
  },
  {
    category: 'Frontend Data',
    files: [
      { path: 'src/data/initialPrompts.ts', name: 'Initial Prompts (DB Seed)' },
    ]
  }
];

// Convert Armenian characters to Unicode escape sequences
const armenianToUnicode = (text: string): string => {
  return text.replace(/[\u0531-\u058F]/g, (char) => {
    return '\\u' + char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0');
  });
};

// Check if text contains Armenian characters
const hasArmenianChars = (text: string): boolean => {
  return /[\u0531-\u058F]/.test(text);
};

export const PromptFilesEditor = () => {
  const { i18n } = useTranslation();
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [copied, setCopied] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['AI Analyze']);

  const getText = (hy: string, ru: string, en: string) => {
    if (i18n.language === 'hy') return hy;
    if (i18n.language === 'ru') return ru;
    return en;
  };

  const handleConvert = useCallback(() => {
    const converted = armenianToUnicode(inputText);
    setOutputText(converted);
    
    if (hasArmenianChars(inputText)) {
      const count = (inputText.match(/[\u0531-\u058F]/g) || []).length;
      toast.success(`${count} \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432 \u043A\u043E\u043D\u0432\u0435\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u043E`);
    } else {
      toast.info('\u0410\u0440\u043C\u044F\u043D\u0441\u043A\u0438\u0435 \u0441\u0438\u043C\u0432\u043E\u043B\u044B \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B');
    }
  }, [inputText]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = e.clipboardData.getData('text');
    
    // Auto-convert on paste if Armenian chars detected
    if (hasArmenianChars(pastedText)) {
      e.preventDefault();
      const converted = armenianToUnicode(pastedText);
      setInputText(prev => prev + pastedText);
      setOutputText(converted);
      
      const count = (pastedText.match(/[\u0531-\u058F]/g) || []).length;
      toast.success(`\u0410\u0432\u0442\u043E-\u043A\u043E\u043D\u0432\u0435\u0440\u0442\u0430\u0446\u0438\u044F: ${count} \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432`);
    }
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(outputText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u043E');
  }, [outputText]);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const copyFilePath = (path: string) => {
    navigator.clipboard.writeText(path);
    toast.success(`\u041F\u0443\u0442\u044C \u0441\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D: ${path}`);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: File List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCode className="h-5 w-5" />
            {getText('\u0556\u0561\u0575\u056C\u0565\u0580', '\u0424\u0430\u0439\u043B\u044B \u043F\u0440\u043E\u043C\u043F\u0442\u043E\u0432', 'Prompt Files')}
          </CardTitle>
          <CardDescription>
            {getText(
              '\u0532\u0578\u056C\u0578\u0580 \u0586\u0561\u0575\u056C\u0565\u0580\u0568',
              '\u0412\u0441\u0435 \u0444\u0430\u0439\u043B\u044B \u043F\u0440\u043E\u0435\u043A\u0442\u0430, \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0449\u0438\u0435 \u043F\u0440\u043E\u043C\u043F\u0442\u044B',
              'All project files containing prompts'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-2">
              {PROMPT_FILES.map((group) => (
                <Collapsible 
                  key={group.category}
                  open={expandedCategories.includes(group.category)}
                  onOpenChange={() => toggleCategory(group.category)}
                >
                  <CollapsibleTrigger asChild>
                    <Button 
                      variant="ghost" 
                      className="w-full justify-between px-3 py-2 h-auto"
                    >
                      <div className="flex items-center gap-2">
                        {expandedCategories.includes(group.category) 
                          ? <ChevronDown className="h-4 w-4" />
                          : <ChevronRight className="h-4 w-4" />
                        }
                        <span className="font-medium">{group.category}</span>
                      </div>
                      <Badge variant="secondary">{group.files.length}</Badge>
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-6 space-y-1 mt-1">
                    {group.files.map((file) => (
                      <div 
                        key={file.path}
                        className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 group cursor-pointer"
                        onClick={() => copyFilePath(file.path)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{file.name}</p>
                          <p className="text-xs text-muted-foreground truncate font-mono">
                            {file.path}
                          </p>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyFilePath(file.path);
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Right: Unicode Converter */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5" />
            {getText(
              'Unicode \u0583\u0578\u056D\u0561\u0580\u056F\u056B\u0579',
              'Unicode \u043A\u043E\u043D\u0432\u0435\u0440\u0442\u0435\u0440',
              'Unicode Converter'
            )}
          </CardTitle>
          <CardDescription>
            {getText(
              '\u0540\u0561\u0575\u0565\u0580\u0565\u0576 \u2192 Unicode',
              '\u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u043A\u043E\u043D\u0432\u0435\u0440\u0442\u0430\u0446\u0438\u044F \u0430\u0440\u043C\u044F\u043D\u0441\u043A\u043E\u0433\u043E \u0442\u0435\u043A\u0441\u0442\u0430 \u0432 \\uXXXX',
              'Auto-convert Armenian text to \\uXXXX'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>
              {getText(
                '\u054F\u0565\u0584\u057D\u057F',
                '\u0412\u0445\u043E\u0434\u043D\u043E\u0439 \u0442\u0435\u043A\u0441\u0442 (\u0432\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0441\u044E\u0434\u0430)',
                'Input text (paste here)'
              )}
            </Label>
            <Textarea
              placeholder={getText(
                '\u054F\u0565\u0554\u057D\u057F \u0570\u0561\u0575\u0565\u0580\u0565\u0576\u0578\u057E...',
                '\u0412\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0442\u0435\u043A\u0441\u0442 \u0441 \u0430\u0440\u043C\u044F\u043D\u0441\u043A\u0438\u043C\u0438 \u0441\u0438\u043C\u0432\u043E\u043B\u0430\u043C\u0438...',
                'Paste text with Armenian characters...'
              )}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onPaste={handlePaste}
              className="min-h-[150px] font-mono text-sm"
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleConvert} className="flex-1">
              <RefreshCw className="h-4 w-4 mr-2" />
              {getText('\u0553\u0578\u056D\u0561\u056F\u0565\u0580\u057A\u0565\u056C', '\u041A\u043E\u043D\u0432\u0435\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C', 'Convert')}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => { setInputText(''); setOutputText(''); }}
            >
              {getText('\u0544\u0561\u0584\u0580\u0565\u056C', '\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C', 'Clear')}
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                {getText(
                  '\u0531\u0580\u0564\u0575\u0578\u0582\u0576\u0584',
                  '\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 (Unicode escape)',
                  'Result (Unicode escape)'
                )}
              </Label>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={handleCopy}
                disabled={!outputText}
              >
                {copied ? (
                  <><Check className="h-4 w-4 mr-1" /> {getText('\u054A\u0561\u057F\u0573\u0565\u0576\u057E\u0561\u056E', '\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u043E', 'Copied')}</>
                ) : (
                  <><Copy className="h-4 w-4 mr-1" /> {getText('\u054A\u0561\u057F\u0573\u0565\u0576\u0565\u043B', '\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C', 'Copy')}</>
                )}
              </Button>
            </div>
            <Textarea
              value={outputText}
              readOnly
              className="min-h-[150px] font-mono text-sm bg-muted"
              placeholder={getText(
                '\u0531\u0580\u0564\u0575\u0578\u0582\u0576\u0584\u0568 \u056F\u056C\u056B\u0576\u056B \u0561\u0575\u057D\u057F\u0565\u0572',
                '\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043F\u043E\u044F\u0432\u0438\u0442\u0441\u044F \u0437\u0434\u0435\u0441\u044C...',
                'Result will appear here...'
              )}
            />
          </div>

          {/* Quick tip */}
          <div className="rounded-lg border p-3 bg-muted/30">
            <p className="text-sm text-muted-foreground">
              <strong>Tip:</strong> {getText(
                '\u054F\u0565\u0584\u057D\u057F\u0568 \u0561\u057E\u057F\u0578\u0574\u0561\u057F \u056F\u0578\u0576\u057E\u0565\u0580\u057F\u0561\u0581\u057E\u0578\u0582\u043C \u0567',
                '\u041F\u0440\u0438 \u0432\u0441\u0442\u0430\u0432\u043A\u0435 \u0442\u0435\u043A\u0441\u0442\u0430 \u0441 \u0430\u0440\u043C\u044F\u043D\u0441\u043A\u0438\u043C\u0438 \u0441\u0438\u043C\u0432\u043E\u043B\u0430\u043C\u0438 \u043A\u043E\u043D\u0432\u0435\u0440\u0442\u0430\u0446\u0438\u044F \u043F\u0440\u043E\u0438\u0441\u0445\u043E\u0434\u0438\u0442 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438.',
                'When pasting Armenian text, conversion happens automatically.'
              )}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
