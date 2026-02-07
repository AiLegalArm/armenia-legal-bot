import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { CRIMINAL_MODULE_PROMPTS, isValidCriminalModule, type CriminalAnalysisModule } from "./criminal-modules.ts";
import {
  getFullPrompt,
  isValidAnalysisType,
  formatPreviousAnalyses,
  type AnalysisType,
  PROMPT_REGISTRY,
} from "./prompts/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Legal AI System Prompts — STRICTLY for Republic of Armenia (RA) law
// CRITICAL: No hallucinations. RAG-FIRST. KB is reference-only.
// NOTE: If external sources (HUDOC/Datalex/ARLIS/EAEU) are NOT connected via KB/RAG,
// the model MUST NOT claim it "checked" them.

type Role = "advocate" | "prosecutor" | "judge" | "aggregator";

const GLOBAL_GUARDS = `
Դու "AI LEGAL ARMENIA" ես՝ իրավական վերլուծական համակարգ Հայաստանի Հանրապետության իրավունքի շրջանակում։

0) Խիստ սահմանափակումներ (պարտադիր)
0.1) Միայն ՀՀ իրավունքի հարցեր. Եթե հարցը ՀՀ իրավունքի շրջանակից դուրս է՝ ասա, որ դուրս է քո իրավասությունից։
0.2) Ոչ մի “գուշակում” / “հորինում”. Եթե տվյալը/հոդվածը/նախադեպը չկա աղբյուրում՝ գրիր «ԱՂԲՅՈՒՐԸ ԲԱՑԱԿԱՅՈՒՄ Է»։
0.3) RAG-FIRST. Հղում անել միայն այն նորմերին/նախադեպերին, որոնք առկա են՝
     ա) օգտատիրոջ տրամադրած նյութերում, կամ
     բ) համակարգի Knowledge Base-ում (օր.՝ ներբեռնված ARLIS/Datalex/HUDOC/EAEU նյութեր)։
0.4) Արգելվում է ասել «ստուգեցի HUDOC/Datalex/ARLIS», եթե համապատասխան տվյալը չի եկել KB/RAG-ով։
0.5) Գաղտնիություն. Օգտատիրոջ նյութերը վերաբերվում են որպես գաղտնի տեղեկատվություն։

1) Օրենքների հիերարխիա (կիրառել միայն վերիֆիկացված աղբյուրներով)
1.1) ՀՀ Սահմանադրություն
1.2) Վավերացված միջազգային պայմանագրեր (այդ թվում՝ ԵԿՄԻԿ)
1.3) ԵԱՏՄ նորմեր (համապատասխան ոլորտներում առաջնահերթ)
1.4) ՀՀ օրենսգրքեր և օրենքներ
1.5) Ենթաօրենսդրական ակտեր
1.6) ՀՀ ՍԴ որոշումներ
1.7) ՀՀ դատարանների պրակտիկա (Վճռաբեկ դատարանի պարզաբանումներ՝ համոզիչ ուժով)

2) KB / դատական պրակտիկա — STRICT REFERENCE-ONLY
2.1) KB փաստաթղթերը օգտագործվում են ՄԻԱՅՆ որպես «Անալոգ դատական պրակտիկա (KB)»։
2.2) Արգելվում է KB փաստերը ներկայացնել որպես օգտատիրոջ գործի փաստեր կամ ապացույց։
2.3) Եթե բերում ես գործ/վճիռ՝ միշտ նշիր աղբյուրը և նույնականացումը (DocID/ChunkID կամ օգտատիրոջ տված հղումը)։

3) Արդյունքի կառուցվածք (պարտադիր)
3.1) Օգտագործել խիստ կառուցվածք և համարակալում։
3.2) Փաստերը բաժանել՝
     - ՀԱՍՏԱՏՎԱԾ (ուղղակիորեն նյութերից)
     - ՉՀԱՍՏԱՏՎԱԾ / ԲԱՑԱԿԱՅՈՒՄ Է (նյութերում չկա)
3.3) Եթե պետք է drafting (բողոք/հայց)՝ անել միայն օգտատիրոջ տրամադրած փաստերով + վերիֆիկացված հղումներով։

4) Դիսկլեյմեր (պարտադիր վերջում)
«Սա արհեստական բանականությամբ ստեղծված վերլուծություն է և չի հանդիսանում պաշտոնական իրավաբանական խորհրդատվություն։ Խորհուրդ է տրվում դիմել լիցենզավորված փաստաբանի»։
`;

const PRACTICE_RULES = `
5) Պրակտիկա և նախադեպեր (միայն KB/RAG-ով)
5.1) ՄԻԵԴ/HUDOC. Կոնկրետ գործեր նշել միայն եթե դրանք առկա են KB-ում կամ տրամադրվել են օգտատիրոջ կողմից։
     Եթե չկա՝ գրել «ԿՈՆԿՐԵՏ ՄԻԵԴ ԳՈՐԾ ՉԻ ՏՐՎԵԼ KB-ՈՒՄ» և տալ միայն ընդհանուր չափանիշներ։
5.2) ՀՀ պրակտիկա (Datalex կամ KB). Բերել 1–2 կոնկրետ օրինակ (դատարան/ամսաթիվ/գործի համար) միայն եթե կան KB-ում։
     Եթե չկա՝ գրել «ՀԱՄԱՆՄԱՆ ՊՐԱԿՏԻԿԱ ՉԻ ԳՏՆՎԵԼ KB-ՈՒՄ»։
5.3) ԵԱՏՄ. Կիրառել միայն համապատասխան ոլորտներում և միայն վերիֆիկացված աղբյուրով։ Եթե չկա՝ «ԵԱՏՄ ԱՂԲՅՈՒՐԸ ԲԱՑԱԿԱՅՈՒՄ Է»։
`;

const CRIMINAL_CHECKLIST = `
6) Քրեական գործերի պարտադիր ստուգումներ (եթե գործը քրեական է)
6.1) Ապացույցների թույլատրելիություն/վերաբերելիություն (միայն աղբյուրով հոդվածներ)
6.2) Մեղադրանքի համապատասխանություն փաստերին և որակավորմանը
6.3) Վկայությունների արժանահավատություն և հակասություններ
6.4) Ընթացակարգային խախտումներ
6.5) Նյութական նորմերի սխալ կիրառություն
6.6) Պաշտպանության և արդար դատաքննության հարցեր (ԵԿՄԻԿ հոդված 6՝ միայն աղբյուրով)
6.7) Հիմնարար իրավունքների ռիսկեր
`;

const CIVIL_CHECKLIST = `
6) Քաղաքացիական գործերի պարտադիր ստուգումներ (եթե գործը քաղաքացիական է)
6.1) Ենթակայություն/իրավասություն
6.2) Նախադատական կարգավորում (եթե պարտադիր է)
6.3) Հայցային պահանջների ձևակերպում/հիմնավորում
6.4) Ապացույցների թույլատրելիություն/բավարարություն
6.5) Ժամկետներ
6.6) Կողմերի հավասարություն/մրցակցայնություն
6.7) Ծանուցում/մասնակցության իրավունք
6.8) Նյութական իրավունքի կիրառություն
`;

const ADMIN_CHECKLIST = `
6) Վարչական գործերի պարտադիր ստուգումներ (եթե գործը վարչական է)
6.1) Ենթակայություն/իրավասություն
6.2) Պարտադիր վարչական բողոքարկում (եթե կա)
6.3) Ժամկետներ
6.4) Լիազորությունների սահմաններ
6.5) Վարչական ակտի օրինականություն/համաչափություն
6.6) Ապացույցների գնահատում
6.7) Դատավարական խախտումներ
6.8) ԵԱՏՄ նորմեր (եթե կիրառելի է և աղբյուր կա)
6.9) ԵԿՄԻԿ/P1-1 (եթե կիրառելի է և աղբյուր կա)
`;

const DRAFTING_MODULES = `
7) Բողոքների/փաստաթղթերի drafting (միայն եթե օգտատերը պահանջել է)
7.1) Վերաքննիչ բողոք — կառուցվածք (վերնագիր/դատարան/գործ/վիճարկվող ակտ/հիմքեր/պահանջ/կցումներ)
7.2) Վճռաբեկ բողոք — միայն իրավունքի էական խախտումներ և նորմերի մեկնաբանություն (միայն աղբյուրով)
7.3) ՄԻԵԴ դիմում — Rule 47 կառուցվածք, 4 ամիս վերջնական որոշումից (նշել միայն որպես ընդհանուր կանոն)
7.4) Վարչական բողոք — ակտ/ժամկետ/հիմքեր/պահանջ
7.5) Եթե պարտադիր ժամկետը կամ հոդվածը չկա աղբյուրում՝ նշել «ԱՂԲՅՈՒՐԸ ԲԱՑԱԿԱՅՈՒՄ Է»։
`;

const ROLE_PROMPTS: Record<Role, string> = {
  advocate: `
Դու գործում ես որպես ADVOCATE MODE՝ պաշտպանական դիրքորոշմամբ իրավական վերլուծություն և փաստարկների կառուցում։
Նպատակ՝ պաշտպանական ռազմավարություն, ռիսկեր, հակափաստարկներ, միջնորդություններ (օրինական շրջանակում)։
`,
  prosecutor: `
Դու գործում ես որպես PROSECUTOR MODE՝ մեղադրանքի պահպանման տեսանկյունից։
Նպատակ՝ ապացույցների բավարարություն/օրինականություն, մեղադրանքի կայունություն, թույլ օղակներ, ռիսկեր։
`,
  judge: `
Դու գործում ես որպես JUDGE MODE՝ լիակատար նեյտրալ գնահատում։
Նպատակ՝ կողմերի փաստարկների հավասար քննություն, հավանական մոտեցումների քարտեզ, որոշման հիմքերի տրամաբանություն։
`,
  aggregator: `
Դու գործում ես որպես AGGREGATOR MODE՝ համեմատում ես advocate/prosecutor/judge արդյունքները։
Նպատակ՝ համընկնումներ/տարբերություններ, ուժեղ/թույլ կողմեր, ընդհանուր ռիսկերի սանդղակ, հաջորդ քայլեր։
`,
};

const CASE_TYPE_ROUTER = `
8) Case-type router (պարտադիր)
8.1) Եթե օգտատերը չի նշել գործի տիպը՝ նախ պարզիր (քրեական/քաղաքացիական/վարչական)՝ մեկ նախադասությամբ։
8.2) Այնուհետև կիրառիր համապատասխան checklist-ը։
`;

// Final system prompts
export const SYSTEM_PROMPTS: Record<Role, string> = {
  advocate: [
    GLOBAL_GUARDS,
    PRACTICE_RULES,
    CASE_TYPE_ROUTER,
    CRIMINAL_CHECKLIST,
    CIVIL_CHECKLIST,
    ADMIN_CHECKLIST,
    DRAFTING_MODULES,
    ROLE_PROMPTS.advocate,
    `Լռելյայն պատասխանել հայերեն, եթե օգտատերը չի գրում այլ լեզվով։`,
  ].join("\n\n"),

  prosecutor: [
    GLOBAL_GUARDS,
    PRACTICE_RULES,
    CASE_TYPE_ROUTER,
    CRIMINAL_CHECKLIST,
    CIVIL_CHECKLIST,
    ADMIN_CHECKLIST,
    ROLE_PROMPTS.prosecutor,
    `Լռելյայն պատասխանել հայերեն, եթե օգտատերը չի գրում այլ լեզվով։`,
  ].join("\n\n"),

  judge: [
    GLOBAL_GUARDS,
    PRACTICE_RULES,
    CASE_TYPE_ROUTER,
    CRIMINAL_CHECKLIST,
    CIVIL_CHECKLIST,
    ADMIN_CHECKLIST,
    ROLE_PROMPTS.judge,
    `Լռելյայն պատասխանել հայերեն, եթե օգտատերը չի գրում այլ լեզվով։`,
  ].join("\n\n"),

  aggregator: [
    GLOBAL_GUARDS,
    PRACTICE_RULES,
    CASE_TYPE_ROUTER,
    ROLE_PROMPTS.aggregator,
    `Լռելյայն պատասխանել հայերեն, եթե օգտատերը չի գրում այլ լեզվով։`,
  ].join("\n\n"),
};
// Armenian legal disclaimer
const DISCLAIMER_HY = `
⚠️ **Զգուշացում (Disclaimer)** 
«Սա արհեստական բանականությամբ ստեղծված վերլուծություն է և չի հանդիսանում պաշտոնական իրավաբանական խորհրդատվություն: Խորհուրդ ենք տալիս դիմել լիցենզավորված փաստաբանի»
`;

interface AnalysisRequest {
  role: "advocate" | "prosecutor" | "judge" | "aggregator" | "criminal_module";
  moduleId?: CriminalAnalysisModule;
  caseId?: string;
  caseFacts?: string;
  legalQuestion?: string;
  advocateResponse?: string;
  prosecutorResponse?: string;
  judgeResponse?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { role, moduleId, caseId, caseFacts, legalQuestion, advocateResponse, prosecutorResponse, judgeResponse } =
      (await req.json()) as AnalysisRequest;

    // Validate role - support both legacy roles and new analysis types
    const legacyRoles = ["advocate", "prosecutor", "judge", "aggregator", "criminal_module"];
    const isLegacyRole = legacyRoles.includes(role);
    const isNewAnalysisType = isValidAnalysisType(role as AnalysisType);

    if (!role || (!isLegacyRole && !isNewAnalysisType)) {
      return new Response(JSON.stringify({ error: "Invalid role or analysis type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate criminal module if applicable
    if (role === "criminal_module" && (!moduleId || !isValidCriminalModule(moduleId))) {
      return new Response(JSON.stringify({ error: "Invalid criminal module ID" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // RAG: Search knowledge base for relevant context
    let ragContext = "";
    const sourcesUsed: Array<{ title: string; category: string; source_name: string }> = [];

    if (caseFacts || legalQuestion) {
      const searchQuery = `${caseFacts || ""} ${legalQuestion || ""}`.trim();

      // Search main Knowledge Base
      const { data: kbResults, error: kbError } = await supabase.rpc("search_knowledge_base", {
        search_query: searchQuery,
        result_limit: 10,
      });

      if (!kbError && kbResults && kbResults.length > 0) {
        const topResults = kbResults.slice(0, 3);

        ragContext = "\n\n## Relevant Legal Sources from RA Knowledge Base:\n\n";
        topResults.forEach(
          (doc: { title: string; category: string; source_name: string; content_text: string }, index: number) => {
            ragContext += `### ${index + 1}. ${doc.title} (${doc.category})\n`;
            ragContext += `Source: ${doc.source_name || "RA Legal Database"}\n`;
            ragContext += `${doc.content_text.substring(0, 2000)}\n\n`;
            sourcesUsed.push({
              title: doc.title,
              category: doc.category,
              source_name: doc.source_name || "RA Legal Database",
            });
          },
        );
      } else {
        ragContext =
          "\n\nNote: No specific legal sources found in knowledge base. Analysis based on general knowledge of RA legislation.\n";
      }

      // Search Legal Practice KB for analogous court cases
      const { data: practiceResults, error: practiceError } = await supabase.rpc("search_legal_practice", {
        search_query: searchQuery,
        result_limit: 5,
      });

      if (!practiceError && practiceResults && practiceResults.length > 0) {
        const topPractice = practiceResults.slice(0, 3);

        ragContext += "\n\n## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
        ragContext +=
          "## \u053b\u0550\u0531\u054e\u0531\u053f\u0531\u0546 \u054a\u0550\u0531\u053f\u054f\u053b\u053f\u0531\u0545\u053b \u0540\u0535\u0546\u0531\u053f\u0531\u0545\u053b\u0546 \u0546\u0545\u0548\u0552\u053f (KB REFERENCE ONLY)\n";
        ragContext += "## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
        ragContext +=
          "\u0540\u053b\u0547\u0535\u0551\u0546\u0535\u0554: \u054d\u057f\u0578\u0580\u0587 \u0576\u0565\u0580\u056f\u0561\u0575\u0561\u0581\u057e\u0561\u056e \u0576\u0575\u0578\u0582\u0569\u0565\u0580\u0568 \u0540\u0535\u0546\u0531\u053f\u0531\u0545\u053b\u0546 \u0546\u0545\u0548\u0552\u053f \u0565\u0576: \u054d\u0561 \u0579\u0567 \u0561\u057a\u0561\u0581\u0578\u0582\u0575\u0581, \u057d\u0561 \u0574\u056b\u0561\u0575\u0576 \u0561\u0576\u0561\u056c\u0578\u0563\u0576\u0565\u0580\u056b \u0570\u0561\u0574\u0561\u0580 \u0567:\n\n";

        const outcomeLabels: Record<string, string> = {
          granted: "\u0532\u0561\u057e\u0561\u0580\u0561\u0580\u057e\u0565\u056c",
          rejected: "\u0544\u0565\u0580\u056a\u057e\u0565\u056c",
          partial: "\u0544\u0561\u057d\u0576\u0561\u056f\u056b",
          remanded: "\u054e\u0565\u0580\u0561\u0564\u0561\u0580\u0571\u057e\u0565\u056c",
          discontinued: "\u053f\u0561\u0580\u0573\u057e\u0565\u056c",
        };

        const courtLabels: Record<string, string> = {
          first_instance: "\u0531\u057c\u0561\u057b\u056b\u0576 \u0561\u057f\u0575\u0561\u0576",
          appeal: "\u054e\u0565\u0580\u0561\u0584\u0576\u0576\u056b\u0579",
          cassation: "\u054e\u0573\u057c\u0561\u0562\u0565\u056f",
          constitutional: "\u054d\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056f\u0561\u0576",
          echr: "\u0535\u054d\u054a\u053f",
        };

        topPractice.forEach(
          (
            doc: {
              title: string;
              practice_category: string;
              court_type: string;
              outcome: string;
              legal_reasoning_summary: string;
              content_snippet: string;
              key_violations: string[];
            },
            index: number,
          ) => {
            ragContext += `### \u0531\u0576\u0561\u056c\u0578\u0563 ${index + 1}: ${doc.title}\n`;
            ragContext += `- **\u0531\u057f\u0575\u0561\u0576:** ${courtLabels[doc.court_type] || doc.court_type}\n`;
            ragContext += `- **\u0531\u0580\u0564\u0575\u0578\u0582\u0576\u0584:** ${outcomeLabels[doc.outcome] || doc.outcome}\n`;
            if (doc.key_violations && doc.key_violations.length > 0) {
              ragContext += `- **\u0540\u056b\u0574\u0576\u0561\u056f\u0561\u0576 \u056d\u0561\u056d\u057f\u0578\u0582\u0574\u0576\u0565\u0580:** ${doc.key_violations.join(", ")}\n`;
            }
            if (doc.legal_reasoning_summary) {
              ragContext += `- **\u053b\u0580\u0561\u057e\u0561\u056f\u0561\u0576 \u0570\u056b\u0574\u0576\u0561\u057e\u0578\u0580\u0578\u0582\u0574:** ${doc.legal_reasoning_summary}\n`;
            }
            ragContext += `\n**\u054f\u0565\u0584\u057d\u057f:** ${doc.content_snippet}\n\n`;

            sourcesUsed.push({
              title: `\u0531\u0576\u0561\u056c\u0578\u0563 \u0564\u0561\u057f\u0561\u056f\u0561\u0576 \u057a\u0580\u0561\u056f\u057f\u056b\u056f\u0561 (KB): ${doc.title}`,
              category: doc.practice_category,
              source_name: "Legal Practice KB",
            });
          },
        );

        ragContext += "\n## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
        ragContext +=
          "## KB \u0540\u0535\u0546\u0531\u053f\u0531\u0545\u053b\u0546 \u0532\u0531\u0536\u0531\u0545\u053b \u0531\u054e\u0531\u0550\u054f\n";
        ragContext += "## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
      }
    }

    // Fetch case files content (OCR results, audio transcriptions, and raw file content) if caseId is provided
    let caseFilesContext = "";
    const fileContentsForVision: Array<{ name: string; base64: string; mimeType: string }> = [];

    if (caseId) {
      // Get case files
      const { data: caseFiles, error: filesError } = await supabase
        .from("case_files")
        .select("id, original_filename, file_type, storage_path")
        .eq("case_id", caseId)
        .is("deleted_at", null);

      if (!filesError && caseFiles && caseFiles.length > 0) {
        const fileIds = caseFiles.map((f) => f.id);

        // Fetch OCR results for these files
        const { data: ocrResults, error: ocrError } = await supabase
          .from("ocr_results")
          .select("file_id, extracted_text, confidence")
          .in("file_id", fileIds);

        // Fetch audio transcriptions for these files
        const { data: transcriptions, error: transError } = await supabase
          .from("audio_transcriptions")
          .select("file_id, transcription_text, confidence")
          .in("file_id", fileIds);

        // Build file context mapping
        const fileMap = new Map(caseFiles.map((f) => [f.id, f]));
        const ocrFileIds = new Set(ocrResults?.map((r) => r.file_id) || []);
        const transFileIds = new Set(transcriptions?.map((t) => t.file_id) || []);

        // Process OCR results
        if (!ocrError && ocrResults && ocrResults.length > 0) {
          caseFilesContext +=
            "\n\n## \u0533\u0578\u0580\u056E\u056B \u0583\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580 (Case Documents - OCR):\n\n";
          ocrResults.forEach((ocr, index) => {
            const file = fileMap.get(ocr.file_id);
            const fileName = file?.original_filename || "Unknown document";
            const text = ocr.extracted_text || "";
            // Increased limit to 8000 chars for better analysis
            const truncatedText = text.length > 8000 ? text.substring(0, 8000) + "..." : text;
            caseFilesContext += `### \u0553\u0561\u057D\u057F\u0561\u0569\u0578\u0582\u0572\u0569 ${index + 1}: ${fileName}\n`;
            if (ocr.confidence) {
              caseFilesContext += `\u054E\u057D\u057f\u0561\u0570\u0578\u0582\u0569\u0575\u0578\u0582\u0576: ${(ocr.confidence * 100).toFixed(0)}%\n`;
            }
            caseFilesContext += `${truncatedText}\n\n`;
          });
        }

        // Process audio transcriptions
        if (!transError && transcriptions && transcriptions.length > 0) {
          caseFilesContext +=
            "\n\n## \u0531\u0578\u0582\u0564\u056B\u0578 \u057f\u0580\u0561\u0576\u057d\u056F\u0580\u056B\u057a\u0581\u056B\u0561\u0576\u0565\u0580 (Audio Transcriptions):\n\n";
          transcriptions.forEach((trans, index) => {
            const file = fileMap.get(trans.file_id);
            const fileName = file?.original_filename || "Unknown audio";
            const text = trans.transcription_text || "";
            const truncatedText = text.length > 8000 ? text.substring(0, 8000) + "..." : text;
            caseFilesContext += `### \u0531\u0578\u0582\u0564\u056B\u0578 ${index + 1}: ${fileName}\n`;
            if (trans.confidence) {
              caseFilesContext += `\u054E\u057d\u057f\u0561\u0570\u0578\u0582\u0569\u0575\u0578\u0582\u0576: ${(trans.confidence * 100).toFixed(0)}%\n`;
            }
            caseFilesContext += `${truncatedText}\n\n`;
          });
        }

        // For files without OCR/transcription, try to read them directly
        const filesWithoutProcessing = caseFiles.filter((f) => !ocrFileIds.has(f.id) && !transFileIds.has(f.id));

        if (filesWithoutProcessing.length > 0) {
          console.log(`Found ${filesWithoutProcessing.length} files without OCR/transcription, attempting direct read`);

          for (const file of filesWithoutProcessing) {
            try {
              const fileType = file.file_type?.toLowerCase() || "";
              const fileName = file.original_filename || "unknown";

              // For images, download and prepare for Vision analysis
              if (
                fileType.includes("image") ||
                fileType.includes("jpeg") ||
                fileType.includes("jpg") ||
                fileType.includes("png")
              ) {
                const { data: fileData, error: downloadError } = await supabase.storage
                  .from("case-files")
                  .download(file.storage_path);

                if (!downloadError && fileData) {
                  const buffer = await fileData.arrayBuffer();
                  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
                  fileContentsForVision.push({
                    name: fileName,
                    base64: base64,
                    mimeType: fileType.includes("png") ? "image/png" : "image/jpeg",
                  });
                }
              }
              // For DOCX files, extract text
              else if (fileType.includes("docx") || fileName.endsWith(".docx")) {
                const { data: fileData, error: downloadError } = await supabase.storage
                  .from("case-files")
                  .download(file.storage_path);

                if (!downloadError && fileData) {
                  try {
                    const buffer = await fileData.arrayBuffer();
                    const uint8 = new Uint8Array(buffer);

                    // DOCX is a ZIP file, find document.xml
                    const zip = await unzipDocx(uint8);
                    if (zip) {
                      const truncatedText = zip.length > 8000 ? zip.substring(0, 8000) + "..." : zip;
                      caseFilesContext += `\n### DOCX \u0553\u0561\u057d\u057f\u0561\u0569\u0578\u0582\u0572\u0569: ${fileName}\n${truncatedText}\n\n`;
                    }
                  } catch (parseErr) {
                    console.error(`Failed to parse DOCX ${fileName}:`, parseErr);
                  }
                }
              }
              // For PDF files without OCR, note that they need processing
              else if (fileType.includes("pdf")) {
                caseFilesContext += `\n### PDF \u0553\u0561\u057d\u057f\u0561\u0569\u0578\u0582\u0572\u0569 (\u0579\u056B \u0574\u0577\u0561\u056F\u057e\u0561\u056E): ${fileName}\n(\u0531\u0575\u057d PDF \u0586\u0561\u0575\u056c\u0568 \u0564\u0565\u057c OCR \u0579\u056B \u0561\u0576\u0581\u0565\u056c, \u056d\u0576\u0564\u0580\u0578\u0582\u0574 \u0565\u0576\u0584 \u0576\u0561\u056d \u0563\u0578\u0580\u056e\u0561\u0580\u056f\u0565\u056c OCR \u0570\u0561\u0574\u0561\u056a\u0578\u0572\u0578\u057e)\n\n`;
              }
              // For TXT files, read directly as text
              else if (fileType.includes("text/plain") || fileName.endsWith(".txt")) {
                const { data: fileData, error: downloadError } = await supabase.storage
                  .from("case-files")
                  .download(file.storage_path);

                if (!downloadError && fileData) {
                  const text = await fileData.text();
                  const truncatedText = text.length > 8000 ? text.substring(0, 8000) + "..." : text;
                  caseFilesContext += `\n### TXT \u0553\u0561\u057d\u057f\u0561\u0569\u0578\u0582\u0572\u0569: ${fileName}\n${truncatedText}\n\n`;
                }
              }
            } catch (fileReadError) {
              console.error(`Error reading file ${file.original_filename}:`, fileReadError);
            }
          }
        }
      }
    }

    // Helper function to extract text from DOCX
    async function unzipDocx(data: Uint8Array): Promise<string | null> {
      try {
        // Simple DOCX text extraction - find document.xml in the ZIP
        const textDecoder = new TextDecoder("utf-8");
        const dataStr = textDecoder.decode(data);

        // Look for the document.xml content between ZIP headers
        // DOCX stores main content in word/document.xml
        const pkSignature = String.fromCharCode(0x50, 0x4b, 0x03, 0x04);

        if (!dataStr.startsWith(pkSignature)) {
          return null;
        }

        // Find XML content patterns and extract text between tags
        const xmlTagPattern = /<w:t[^>]*>([^<]*)<\/w:t>/g;
        const matches: string[] = [];
        let match;

        // Convert to text and search for w:t tags (Word text elements)
        const fullText = textDecoder.decode(data);
        while ((match = xmlTagPattern.exec(fullText)) !== null) {
          if (match[1]) {
            matches.push(match[1]);
          }
        }

        if (matches.length > 0) {
          return matches.join(" ");
        }

        // Fallback: extract any readable text
        const readableText = fullText
          .replace(/<[^>]+>/g, " ")
          .replace(/[^\u0000-\u007F\u0400-\u04FF\u0530-\u058F\u0020-\u007E]/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        return readableText.length > 100 ? readableText.substring(0, 15000) : null;
      } catch (err) {
        console.error("DOCX parse error:", err);
        return null;
      }
    }

    // Build user message
    let userMessage = "";

    if (role === "aggregator") {
      userMessage = `## Case for Comprehensive Legal Analysis (RA Law):

### Case Facts:
${caseFacts || "Not provided"}

### Legal Question:
${legalQuestion || "Not provided"}

${caseFilesContext}

${ragContext}

---

## Previous Role Analyses:

### Advocate (Defense) Analysis:
${advocateResponse || "Not available"}

### Prosecutor Analysis:
${prosecutorResponse || "Not available"}

### Judge Analysis:
${judgeResponse || "Not available"}

---

Please provide a comprehensive synthesis of all perspectives and your final recommendation based on Republic of Armenia legislation. Make sure to reference any case documents and audio transcriptions provided above.`;
    } else if (role === "criminal_module" && moduleId) {
      // Criminal module-specific analysis
      userMessage = `## \u0554\u0580\u0565\u0561\u056F\u0561\u0576 \u0563\u0578\u0580\u056E\u056B \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576 (Criminal Case Analysis):

### \u0533\u0578\u0580\u056E\u056B \u0583\u0561\u057D\u057F\u0565\u0580 (Case Facts):
${caseFacts || "\u0546\u0577\u057E\u0561\u056E \u0579\u0567"}

### \u053B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u0570\u0561\u0580\u0581 (Legal Question):
${legalQuestion || "\u0546\u0577\u057E\u0561\u056E \u0579\u0567"}

${caseFilesContext}

${ragContext}

Perform focused analysis as specified in the system prompt. Base your analysis ONLY on the provided case materials. If information is missing, state this explicitly.`;
    } else {
      userMessage = `## Legal Case for Analysis (RA Law):

### Case Facts:
${caseFacts || "Not provided"}

### Legal Question:
${legalQuestion || "Not provided"}

${caseFilesContext}

${ragContext}

Please provide your professional legal analysis from your designated role perspective, strictly based on Republic of Armenia legislation. Analyze all case documents and audio transcriptions provided above.`;
    }

    // Determine which system prompt to use
    let systemPrompt: string;
    if (role === "criminal_module" && moduleId) {
      // Legacy criminal module support
      systemPrompt = CRIMINAL_MODULE_PROMPTS[moduleId];
    } else if (isValidAnalysisType(role)) {
      // New 9-module analysis system
      systemPrompt = getFullPrompt(role as AnalysisType);
    } else {
      // Legacy role-based prompts (advocate, prosecutor, judge, aggregator)
      systemPrompt = SYSTEM_PROMPTS[role as keyof typeof SYSTEM_PROMPTS];
    }

    // Build message content with vision support for images
    let messageContent: any;

    if (fileContentsForVision.length > 0) {
      // Use multimodal message format with images
      console.log(`Including ${fileContentsForVision.length} images for Vision analysis`);

      const contentParts: any[] = [{ type: "text", text: userMessage }];

      // Add images (limit to 5 to avoid token overflow)
      const imagesToInclude = fileContentsForVision.slice(0, 5);
      for (const img of imagesToInclude) {
        contentParts.push({
          type: "image_url",
          image_url: {
            url: `data:${img.mimeType};base64,${img.base64}`,
          },
        });
        // Add filename reference
        contentParts.push({
          type: "text",
          text: `[\u054A\u0561\u057f\u056F\u0565\u0580: ${img.name}]`,
        });
      }

      if (fileContentsForVision.length > 5) {
        contentParts.push({
          type: "text",
          text: `\n(\u0546\u0577\u0578\u0582\u0574: ${fileContentsForVision.length - 5} \u056C\u0580\u0561\u0581\u0578\u0582\u0581\u056B\u0579 \u057A\u0561\u057f\u056F\u0565\u0580 \u0579\u0565\u0576 \u0576\u0565\u0580\u0561\u057c\u057E\u0565\u056c \u057d\u0561\u0570\u0574\u0561\u0576\u0561\u0583\u0561\u056f\u0574\u0561\u0576 \u057a\u0561\u057f\u0573\u0561\u057c\u0578\u057e)`,
        });
      }

      messageContent = contentParts;
    } else {
      messageContent = userMessage;
    }

    // Call Legal AI (Gemini Pro for high-quality Armenian legal reasoning with vision)
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: messageContent },
        ],
        temperature: 0.7,
        top_p: 0.92,
        frequency_penalty: 1.2,
        max_tokens: 16384,
      }),
    });

    if (!response.ok) {
      const errorStatus = response.status;
      if (errorStatus === 429) {
        await supabase.rpc("log_error", {
          _error_type: "llm",
          _error_message: "Rate limit exceeded",
          _error_details: { status: 429, role },
          _case_id: caseId || null,
        });
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (errorStatus === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please contact administrator." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("Legal AI gateway error:", errorStatus, errorText);

      await supabase.rpc("log_error", {
        _error_type: "llm",
        _error_message: "Legal AI gateway error: " + errorStatus,
        _error_details: { status: errorStatus, error: errorText, role },
        _case_id: caseId || null,
      });

      throw new Error("Legal AI gateway error");
    }

    // Robust JSON parsing to handle truncated/malformed responses
    let aiResponse;
    try {
      const responseText = await response.text();

      // Try to parse JSON, with fallback for truncated responses
      try {
        aiResponse = JSON.parse(responseText);
      } catch (parseError) {
        console.error("JSON parse error, attempting recovery:", parseError);

        // Try to extract valid JSON from potentially truncated response
        let cleaned = responseText.trim();

        // Remove any markdown code blocks
        cleaned = cleaned
          .replace(/```json\s*/gi, "")
          .replace(/```\s*/g, "")
          .trim();

        // Find JSON boundaries
        const jsonStart = cleaned.indexOf("{");
        const jsonEnd = cleaned.lastIndexOf("}");

        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          cleaned = cleaned.substring(jsonStart, jsonEnd + 1);

          // Fix common JSON issues
          cleaned = cleaned
            .replace(/,\s*}/g, "}") // Remove trailing commas
            .replace(/,\s*]/g, "]")
            .replace(/[\x00-\x1F\x7F]/g, ""); // Remove control characters

          try {
            aiResponse = JSON.parse(cleaned);
          } catch (secondError) {
            console.error("JSON recovery failed:", secondError);
            // Return a fallback response instead of crashing
            return new Response(
              JSON.stringify({
                role,
                analysis: "Վdelays were too large. Please try again with fewer documents or a simpler query.",
                sources: [],
                model: "google/gemini-2.5-pro",
                warning: "Response was truncated",
              }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          }
        } else {
          console.error("No valid JSON structure found in response");
          return new Response(
            JSON.stringify({
              role,
              analysis: "AI-ի պdelays were incomplete. Please try again.",
              sources: [],
              model: "google/gemini-2.5-pro",
              warning: "Invalid response structure",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }
    } catch (fetchError) {
      console.error("Error reading AI response:", fetchError);
      throw new Error("Failed to read AI response");
    }

    let analysisText = aiResponse.choices?.[0]?.message?.content || "";

    // Check for truncation indicators
    if (analysisText.endsWith("...") || analysisText.endsWith("\u2026")) {
      analysisText +=
        "\n\n[\u0546\u0577\u0578\u0582\u0574: \u054A\u0561\u057F\u0561\u057D\u056D\u0561\u0576\u0568 \u056F\u0561\u0580\u0578\u0572 \u0567 \u056F\u0580\u0573\u0561\u057F\u057E\u0561\u056E \u056C\u056B\u0576\u0565\u056C: \u053D\u0576\u0564\u0580\u0578\u0582\u0574 \u0565\u0576\u0584 \u0583\u0578\u0580\u0571\u0565\u056C \u0576\u0578\u0580\u056B\u0581 \u0561\u057E\u0565\u056C\u056B \u0584\u056B\u0579 \u0583\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580\u0578\u057E:]";
    }

    // Add legal disclaimer
    analysisText += DISCLAIMER_HY;

    // Save to database if caseId provided
    if (caseId) {
      const authHeader = req.headers.get("authorization");
      let userId = null;

      if (authHeader) {
        const token = authHeader.replace("Bearer ", "");
        const {
          data: { user },
        } = await supabase.auth.getUser(token);
        userId = user?.id || null;
      }

      // Determine the role/analysis_type to store
      let roleToStore: string;
      if (role === "criminal_module" && moduleId) {
        // Legacy criminal module format
        roleToStore = `criminal_module:${moduleId}`;
      } else if (isValidAnalysisType(role)) {
        // New 9-module analysis system - store analysis type directly
        roleToStore = role;
      } else {
        // Legacy role-based analysis
        roleToStore = role;
      }

      await supabase.from("ai_analysis").insert({
        case_id: caseId,
        role: roleToStore,
        prompt_used: userMessage.substring(0, 2000),
        response_text: analysisText,
        sources_used: sourcesUsed.length > 0 ? sourcesUsed : null,
        created_by: userId,
      });
    }

    // Log API usage for cost tracking
    const tokensUsed = aiResponse.usage?.total_tokens || 0;
    const estimatedCost = tokensUsed * 0.000001;

    await supabase.rpc("log_api_usage", {
      _service_type: "llm",
      _model_name: "google/gemini-2.5-pro",
      _tokens_used: tokensUsed,
      _estimated_cost: estimatedCost,
      _metadata: { role, caseId: caseId || null },
    });

    return new Response(
      JSON.stringify({
        role,
        moduleId: moduleId || null,
        analysis: analysisText,
        sources: sourcesUsed,
        model: "Legal AI (google/gemini-2.5-pro)",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Legal AI error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Legal analysis failed",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
