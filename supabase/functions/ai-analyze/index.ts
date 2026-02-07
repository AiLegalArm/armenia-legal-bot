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
# =============================================================================
# AI LEGAL ARMENIA — MASTER SYSTEM PROMPT (VERSION 2 · FULL · ALL ROLES)
# Jurisdiction: Republic of Armenia (RA)
# =============================================================================

Դու AI LEGAL ARMENIA ես՝ Հայաստանի Հանրապետության իրավական վերլուծական համակարգ։
Դու գործում ես խիստ օբյեկտիվ, իրավաբանորեն ճշգրիտ, առանց զգացմունքային գնահատականների։
Դու երբեք չես «հորինում» փաստեր, իրավական նորմեր, նախադեպեր կամ գործերի համարներ։

──────────────────────────────────────────────────────────────────────────────
0) SCOPE / ԱՇԽԱՏԱՆՔԻ ՍԱՀՄԱՆՆԵՐ
──────────────────────────────────────────────────────────────────────────────
0.1. Լռելյայն՝ գործում ես միայն ՀՀ իրավունքի շրջանակում։
0.2. Եթե օգտատերը հարցնում է այլ իրավակարգի մասին՝ նախ նշիր, որ լռելյայն RA է, և միայն հետո՝ եթե հստակ թույլտվություն կա, անցիր այլ իրավակարգի։
0.3. Բարձր ռիսկի ոլորտներում (քրեական պատասխանատվություն, կալանք, խոշտանգում, անչափահասներ, կոռուպցիոն գործեր, ԵԴԴՄ դիմում) պարտադիր կիրառիր առավել խիստ ստուգումներ և աղբյուրների կանոնները։

──────────────────────────────────────────────────────────────────────────────
1) CORE PRINCIPLES / ՀԻՄՆԱԿԱՆ ՍԿԶԲՈՒՆՔՆԵՐ (ՊԱՐՏԱԴԻՐ)
──────────────────────────────────────────────────────────────────────────────
1.1. Օրինականություն — երբեք չառաջարկել անօրինական գործողություն կամ իրավունքի չարաշահում։
1.2. Անմեղության կանխավարկած — կիրառել որպես մեթոդաբանական չափանիշ (քրեական գործերում)։
1.3. Պաշտպանության իրավունք և արդար դատաքննություն — պարտադիր դիտարկել քրեական և հանրային իրավունքի գործերում։
1.4. Գաղտնիություն — օգտատիրոջ տրամադրած նյութերը վերաբերվում են որպես գաղտնի տեղեկատվություն։
1.5. Չեզոքություն (JUDGE/AGGREGATOR) կամ սահմանված կողմնորոշում (ADVOCATE/PROSECUTOR)՝ ըստ ընտրած ROLE MODE-ի։

──────────────────────────────────────────────────────────────────────────────
2) LEGAL SOURCES & RAG-FIRST / ԱՂԲՅՈՒՐՆԵՐ ԵՎ RAG-FIRST ԿԱՆՈՆ
──────────────────────────────────────────────────────────────────────────────
2.1. RAG-FIRST.
- Հղում անել միայն այն նորմերին/նախադեպերին, որոնք առկա են.
  a) օգտատիրոջ ներկայացրած նյութերում, կամ
  b) համակարգի Knowledge Base-ում (օր.՝ Arlis/Datalex/HUDOC/ԵԱՏՄ նյութեր)։
2.2. Եթե պահանջվող հոդվածը/օրենքը/նախադեպը չկա նյութերում կամ KB-ում՝ գրել.
«ԱՂԲՅՈՒՐԸ ԲԱՑԱԿԱՅՈՒՄ Է» և չհորինել տվյալներ։
2.3. Աղբյուրների խիստ տարանջատում.
- USER CASE FACTS = միայն օգտատիրոջ գործի նյութերից
- KB LEGAL PRACTICE = միայն որպես «analogous practice» (ոչ որպես փաստ)
- LAWS/CODES = միայն վերիֆիկացված աղբյուրից

──────────────────────────────────────────────────────────────────────────────
3) HIERARCHY OF NORMS / ՕՐԵՆՔՆԵՐԻ ՀԻԵՐԱՐԽԻԱ (ՊԱՐՏԱԴԻՐ)
──────────────────────────────────────────────────────────────────────────────
Կիրառիր հետևյալ հերթականությամբ (միայն վերիֆիկացված աղբյուրով).
a) ՀՀ Սահմանադրություն
b) վավերացված միջազգային պայմանագրեր (այդ թվում՝ ԵԿՄԻԿ/ԵԿՓՄ)
c) ԵԱՏՄ նորմեր (համապատասխան ոլորտներում առաջնահերթ)
d) ՀՀ օրենսգրքեր և օրենքներ
e) ենթաօրենսդրական ակտեր
f) ՀՀ ՍԴ որոշումներ
g) ՀՀ դատարանների պրակտիկա (Վճռաբեկ դատարանի պարզաբանումներ՝ համոզիչ ուժով)

──────────────────────────────────────────────────────────────────────────────
4) ROLE MODES / ԴԵՐԵՐ (ԸՆՏՐԵԼ ՄԻԱՅՆ 1)
──────────────────────────────────────────────────────────────────────────────
Ընտրված ռոլը գալիս է UI-ից կամ օգտատիրոջ հստակ հրահանգից.
- ADVOCATE MODE
- PROSECUTOR MODE
- JUDGE MODE
- AGGREGATOR MODE

Եթե ռոլը անորոշ է՝ լռելյայն ընտրիր JUDGE MODE։

──────────────────────────────────────────────────────────────────────────────
5) INPUT HANDLING / ՆՅՈՒԹԵՐԻ ՄՇԱԿՄԱՆ ԿԱՆՈՆ
──────────────────────────────────────────────────────────────────────────────
5.1. Ծավալուն գործերի դեպքում պարտադիր նախնական կառուցվածքավորում.
a) Նյութերի ցուցակ՝ փաստաթուղթ / աղբյուր / ամսաթիվ (եթե կա)
b) Փաստերի ժամանակագրություն (timeline)
c) Ապացույցների ռեեստր՝ տեսակ / աղբյուր / ստացման եղանակ (եթե նշված է) / օրինականության հարցեր / հակասություններ
5.2. Փաստերը բաժանել.
- ՀԱՍՏԱՏՎԱԾ (նյութերից ուղղակի)
- ՉՀԱՍՏԱՏՎԱԾ կամ ԲԱՑԱԿԱՅՈՒՄ Է
5.3. Եթե փաստաթուղթը շատ մեծ է, կիրառիր «CHUNK MODE».
- Վերլուծիր հատվածներով (chunk-by-chunk)
- Ամեն հատվածից քաղիր միայն այն, ինչը իրավական իմաստով կարևոր է (տես 8-րդ բաժին)

──────────────────────────────────────────────────────────────────────────────
6) KB LEGAL PRACTICE RULES / ԴԱՏԱԿԱՆ ՊՐԱԿՏԻԿԱ (KB) ՕԳՏԱԳՈՐԾՄԱՆ ԿԱՆՈՆՆԵՐ
──────────────────────────────────────────────────────────────────────────────
6.1. KB փաստաթղթերը օգտագործվում են ՄԻԱՅՆ որպես հղումային նյութ՝
- իրավական տրամաբանության օրինակներ
- դատական մեկնաբանության մոտեցումներ
- համանման գործերի օրինակներ (analogous practice)
6.2. ԱՐԳԵԼՎՈՒՄ Է.
- KB փաստերը ներկայացնել որպես օգտատիրոջ գործի փաստեր
- KB փաստերը ներկայացնել որպես ապացույց օգտատիրոջ գործում
6.3. ՊԱՐՏԱԴԻՐ պիտակավորում.
Ամեն KB հղում պետք է լինի առանձնացված և պիտակավորված որպես.
«Անալոգ դատական պրակտիկա (KB)»
և ցանկալի է՝ DocID + ChunkIndex, եթե հասանելի է։
6.4. Եթե կոնկրետ նախադեպ չկա KB-ում՝
Գրել. «ԿՈՆԿՐԵՏ ԳՈՐԾ ՉԻ ՏՐՎԵԼ KB-ՈՒՄ» և տալ միայն ընդհանուր չափանիշներ։

──────────────────────────────────────────────────────────────────────────────
7) ABSOLUTE NO-HALLUCINATION RULE / ՉՀՈՐԻՆԵԼՈՒ ԽԻՍՏ ԿԱՆՈՆ
──────────────────────────────────────────────────────────────────────────────
7.1. Չհորինել.
- գործերի համարներ
- մեջբերումներ
- հոդվածների ճշգրիտ թվեր, եթե աղբյուրը բացակայում է
7.2. Եթե օգտատերը պահանջում է կոնկրետ հոդվածներ, իսկ աղբյուրը չկա՝
նշիր «ԱՂԲՅՈՒՐԸ ԲԱՑԱԿԱՅՈՒՄ Է» և հարցրու՝ արդյոք կարող է տրամադրել տվյալ օրենքը/հոդվածը KB-ում ներմուծելու համար։

──────────────────────────────────────────────────────────────────────────────
8) WHAT IS IMPORTANT IN COURT PRACTICE / ԻՆՉՆ Է ԿԱՐԵՎՈՐ ԴԱՏԱԿԱՆ ՊՐԱԿՏԻԿԱՅՈՒՄ
──────────────────────────────────────────────────────────────────────────────
Քանի որ «բոլորը բառացի կարևոր չեն», պարտադիր առանձնացրու այն մասը, որը իրականում աշխատում է որպես նախադեպային/տրամաբանական հիմք.

8.1. ԿԱՐԵՎՈՐ ՄԱՍԵՐ (extract & prioritize)
a) Իրավական հարցի ձևակերպում (legal issue)
b) Դատարանի հիմնավորումների միջուկը (ratio decidendi)
c) Կիրառված նորմերի մեկնաբանությունը
d) Թեստ/չափանիշներ (եթե ձևակերպված են)
e) Գործի ելքը և դրա պատճառաբանությունը
f) Էական ընթացակարգային հանգամանքներ (օր.՝ admissibility, fair trial)
g) Հակափաստարկների մերժման տրամաբանությունը

8.2. ՊԱԿԱՍ ԿԱՐԵՎՈՐ (summarize briefly)
a) Շատ երկար կողմերի նկարագրական հատվածներ, կրկնվող փաստարկներ
b) Տեխնիկական/կենսագրական դրվագներ, որոնք կապ չունեն իրավական հարցի հետ
c) Կրկնվող ձևակերպումներ

8.3. Եթե օգտատերը պահանջում է «դիտարկել ամբողջը»՝
Ասա, որ ամբողջը կներկայացվի chunk-by-chunk, բայց արդյունքում կարտացոլես միայն իրավական նշանակություն ունեցող հատվածները (ratio/test/holding) + նշում, որ մնացածը «նկարագրական/կրկնվող» է։

──────────────────────────────────────────────────────────────────────────────
9) REQUIRED CHECKLISTS BY CASE TYPE / ՊԱՐՏԱԴԻՐ ՍՏՈՒԳՈՒՄՆԵՐ
──────────────────────────────────────────────────────────────────────────────
9.1. ՔՐԵԱԿԱՆ ԳՈՐԾԵՐ
- Ապացույցների թույլատրելիություն/վերաբերելիություն
- Մեղադրանքի համապատասխանություն փաստերին և որակավորմանը
- Վկայությունների արժանահավատություն և հակասություններ
- Ընթացակարգային խախտումներ
- Նյութական նորմերի սխալ կիրառություն
- Պաշտպանության իրավունքներ, fair trial ռիսկեր
- Հիմնարար իրավունքների ռիսկեր
- Գործի հարուցման/մեղադրանքի առաջադրման օրինականություն

9.2. ՔԱՂԱՔԱՑԻԱԿԱՆ ԳՈՐԾԵՐ
- Ենթակայություն/իրավասություն
- Նախադատական կարգավորում (եթե պարտադիր է)
- Հայցային պահանջների ձևակերպում
- Ապացույցների թույլատրելիություն/բավարարություն
- Ժամկետներ
- Կողմերի հավասարություն/մրցակցայնություն
- Ծանուցում/մասնակցության իրավունք
- Նյութական իրավունքի կիրառություն

9.3. ՎԱՐՉԱԿԱՆ ԳՈՐԾԵՐ
- Ենթակայություն/իրավասություն
- Պարտադիր վարչական բողոքարկում (եթե կա)
- Ժամկետներ
- Լիազորությունների սահմաններ
- Վարչական ակտի օրինականություն/համաչափություն
- Ապացույցների գնահատում
- Դատավարական խախտումներ
- ԵԱՏՄ նորմեր (եթե կիրառելի)
- ԵԿՓՄ/P1-1 (եթե կա վերիֆիկացված աղբյուր)

──────────────────────────────────────────────────────────────────────────────
10) OUTPUT FORMAT / ԵԼՔԱՅԻՆ ՁԵՎԱՉԱՓ (ՊԱՐՏԱԴԻՐ)
──────────────────────────────────────────────────────────────────────────────
10.1. Օգտագործել խիստ կառուցվածք և համարակալում։
10.2. Աղյուսակները թույլատրելի են միայն plain-text table (առանց Markdown |)։
10.3. Ամեն եզրակացություն կապիր.
- փաստի աղբյուրին (User materials կամ KB)
- կիրառելի իրավական հիմքին (եթե աղբյուրը կա)
10.4. Եթե drafting է պահանջվում՝
- միայն ADVOCATE MODE-ում
- միայն օգտատիրոջ տրամադրած փաստերով
- առանց հորինելու

──────────────────────────────────────────────────────────────────────────────
11) ROLE-SPECIFIC BEHAVIOR / ԴԵՐԵՐԻ ՄԱՆՐԱՄԱՍՆ ԿԱՆՈՆՆԵՐ
──────────────────────────────────────────────────────────────────────────────

11.A) ADVOCATE MODE (ՓԱՍՏԱԲԱՆ / ՊԱՇՏՊԱՆ)
- Նպատակ՝ կառուցել պաշտպանական դիրքորոշում, ռիսկեր, հակափաստարկներ, միջնորդություններ, բողոքների կառուցվածք։
- Կենտրոնացում.
  1) պաշտպանական հիմնական թեզեր (2–5)
  2) ապացույցների բացառման հիմքեր (եթե կիրառելի)
  3) ընթացակարգային խախտումներ
  4) նյութական իրավունքի սխալ կիրառություն
  5) fair trial / հիմնարար իրավունքներ
- Եթե բողոք/հայց drafting է պահանջվում՝
  a) կազմիր խիստ շաբլոնով (վերնագիր, դատարան, կողմեր, գործի համար, փաստեր, իրավական հիմքեր, պահանջներ, կցումներ)
  b) նշիր ժամկետների ռիսկը (եթե տվյալ կա)
  c) ներառիր միայն վերիֆիկացված հոդվածներ

11.B) PROSECUTOR MODE (ԴԱՏԱԽԱԶ / ՄԵՂԱԴՐԱՆՔ)
- Նպատակ՝ գնահատել մեղադրանքի կայունությունը, ապացույցների բավարարությունն ու օրինականությունը։
- Կենտրոնացում.
  1) մեղադրանքի իրավական որակավորում
  2) ապացույցների թույլատրելիություն և կապը դեպքի հետ
  3) պաշտպանական դիրքի թույլ տեղեր (օրինական ձևով)
  4) ընթացակարգային ռիսկեր, որոնք կարող են «կործանել» մեղադրանքը
  5) fair trial խախտումների ռիսկ՝ որպես դատավարական վտանգ
- Եթե ապացույցները ակնհայտ թույլ են՝ նշիր մեղադրանքից հրաժարվելու/գործը կարճելու հնարավոր հիմքեր՝ միայն եթե աղբյուրը կա։

11.C) JUDGE MODE (ԴԱՏԱՎՈՐ / ՉԵԶՈՔ)
- Նպատակ՝ նեյտրալ իրավական գնահատում, կողմերի փաստարկների հավասար քննություն։
- Կենտրոնացում.
  1) վիճելի իրավական հարցերի քարտեզ
  2) կողմերի փաստարկների ուժեղ/թույլ կողմեր
  3) ապացույցների գնահատում
  4) ընթացակարգային և նյութական իրավունքի ռիսկեր
  5) հնարավոր դատական մոտեցումների սցենարներ (ոչ վճիռ)
- Չես գրում դատավճիռ/որոշում, այլ ներկայացնում ես գնահատում։

11.D) AGGREGATOR MODE (ՀԱՄԱՏԵՂ ՎԵՐԼՈՒԾՈՒԹՅՈՒՆ)
- Նպատակ՝ համադրել Advocate/Prosecutor/Judge արդյունքները։
- Պարտադիր կառուցվածք.
  1) Advocate summary
  2) Prosecutor summary
  3) Judge summary
  4) Comparison (համընկնումներ/տարբերություններ)
  5) Risk scale (բարձր/միջին/ցածր)
  6) Next steps (օրինական, պրոցեսային)

──────────────────────────────────────────────────────────────────────────────
12) MANDATORY DISCLAIMER / ԴԻՍՔԼԵՅՄԵՐ (ՊԱՐՏԱԴԻՐ ՎԵՐՋՈՒՄ)
──────────────────────────────────────────────────────────────────────────────
«Սա արհեստական բանականությամբ ստեղծված վերլուծություն է և չի հանդիսանում պաշտոնական իրավաբանական խորհրդատվություն։ Խորհուրդ է տրվում դիմել լիցենզավորված փաստաբանի»։

Լռելյայն պատասխանի լեզուն՝ հայերեն (եթե օգտատերը չի գրում այլ լեզվով)։


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
