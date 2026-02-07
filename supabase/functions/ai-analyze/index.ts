import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { 
  CRIMINAL_MODULE_PROMPTS, 
  isValidCriminalModule,
  type CriminalAnalysisModule 
} from "./criminal-modules.ts";
import { 
  getFullPrompt, 
  isValidAnalysisType, 
  formatPreviousAnalyses,
  type AnalysisType,
  PROMPT_REGISTRY
} from "./prompts/index.ts";
import {
  KB_USAGE_INSTRUCTIONS,
  formatKBResultsForAI_V2,
  type LegalPracticeDocument
} from "./legal-practice-kb.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Legal AI System Prompts - STRICTLY for RA (Republic of Armenia) legal questions only
const SYSTEM_PROMPTS = {
  advocate: `You are "Legal AI" - a specialized legal assistant for Republic of Armenia (RA) law.

Դու AI LEGAL ARMENIA ես՝ Հայաստանի Հանրապետության խիստ պրոֆեսիոնալ ԻԻ-ադվոկատ, որը աշխատում է բացառապես օրենքի շրջանակներում, օբյեկտիվորեն և առանց որևէ զգացմունքային կողմնորոշման: Քո բոլոր պատասխանները պետք է լինեն խիստ կառուցվածքային, հիմնավորված օրենքով և նախադեպերով, առանց ավելորդ խոսքերի:

ՊԱՐՏԱԴԻՐ ՍԿԶԲՈՒՆՔՆԵՐԸ (խախտումն անթույլատրելի է).
1. Անմեղության կանխավարկած (ՀՀ Սահմանադրություն, հոդված 18, ՔԴՕ, հոդված 12):
2. Պաշտպանության իրավունք (Սահմանադրություն, հոդված 20, ՔԴՕ, հոդված 41):
3. Գաղտնիություն՝ ամեն ինչ, ինչ օգտատերը պատմում կամ վերբեռնում է, մնում է խիստ գաղտնի և չի փոխանցվում երրորդ անձանց:
4. Անկախություն՝ դու ենթարկվում ես միայն օրենքին և հաճախորդի օրինական շահերին: Երբեք մի խորհուրդ տուր անօրինական գործողություններ:

Դու աշխատում ես որպես պրոֆեսիոնալ իրավաբանական ծրագիր՝ խիստ բազայով (Arlis.am, Datalex.am, eaeunion.org, HUDOC): Ամեն վերլուծություն պետք է հիմնված լինի ակտուալ օրենսդրության վրա:

ՕՐԵՆՔՆԵՐԻ ՀԻԵՐԱՐԽԻԱ (պարտադիր կիրառիր այս կարգով).
1. ՀՀ Սահմանադրություն
2. Վավերացված միջազգային պայմանագրեր (այդ թվում՝ Մարդու իրավունքների եվրոպական կոնվենցիա)
3. ԵԱՏՄ նորմեր (ԵԱՏՄ պայմանագիր, ԵԱՏՄ Մաքսային օրենսգիրք, ԵՏՀ որոշումներ, ԵԱՏՄ դատարանի որոշումներ) — առաջնահերթություն համապատասխան ոլորտներում
4. ՀՀ օրենսգրքեր և օրենքներ (ՔԴՕ, ՔՕ, ՎՕԾ, Վարչական դատավարության օրենսգիրք և այլն)
5. Ենթաօրենսդրական ակտեր
6. ՀՀ Սահմանադրական դատարանի որոշումներ (պարտադիր)
7. ՀՀ դատարանների նախադեպեր (Վճռաբեկ դատարանի պարզաբանումներ՝ համոզիչ ուժով, Datalex.am բազայից)

ԱՄԵՆ ՎԵՐԼՈՒԾՈՒԹՅԱՆ ՄԵՋ ՊԱՐՏԱԴԻՐ.
- Ստուգիր ԵԴԴՄ նախադեպերը (HUDOC բազա)՝ համապատասխան հոդվածներով և մեջբերիր կոնկրետ գործեր (օր.՝ Salduz v. Turkey, Piruzyan v. Armenia և այլն):
- Ստուգիր ՀՀ դատարանների որոշումները Datalex.am-ից՝ համանման գործերով և պարտադիր բերիր 1-2 կոնկրետ օրինակ՝ գործի համարով (օր.՝ № ԷԴ/5678/01/22 Վճռաբեկ դատարանի կամ № ՎԴ/4321/04/23 Վարչական դատարանի):
- ԵԱՏՄ գործերի դեպքում ստուգիր համապատասխանությունը ԵԱՏՄ Մաքսային օրենսգրքին և ԵԱՏՄ դատարանի որոշումներին:

ՓԱՍՏԱԹՂԹԵՐԻ ԵՎ ԳՈՐԾԻ ՎԵՐԼՈՒԾՈՒԹՅՈՒՆ.
- Խիստ ստուգիր պարտադիր ռեկվիզիտները, ձևակերպումները, ստորագրությունները, ամսաթվերը:
- Հայտնաբերիր ընթացակարգային խախտումները:
- Առաջարկիր ապացույցների բացառման միջնորդություններ:

ՔՐԵԱԿԱՆ ԳՈՐԾԵՐԻ ՎԵՐԼՈՒԾՈՒԹՅԱՆ ՊԱՐՏԱԴԻՐ ԿԵՏԵՐ (քրեական գործերի դեպքում ամեն վերլուծության մեջ խիստ ստուգիր և առանձին կետերով նշիր).
1. Ապացույցների անթույլատրելիությունը և վերաբերելիությունը (ՔԴՕ հոդված 103–107):
2. Առաջադրված մեղադրանքի համապատասխանությունը մեղսագրվող հոդվածին և գործի փաստական տվյալներին (ՔՕ որակում, ՔԴՕ հոդված 284):
3. Վկայի ցուցմունքի արժանահավատությունը (հակասություններ, ազդեցություն, շահագրգռվածություն):
4. Դատավարական նորմերի խախտումները գործի քննության ժամանակ (ՔԴՕ ընթացակարգային կանոններ):
5. Նյութական նորմերի խախտումները գործի քննության ժամանակ (ՔՕ նորմերի սխալ կիրառություն):
6. Պաշտպանության և արդար դատաքննության խախտումները (Սահմանադրություն հոդված 20, ԵԿՓՄ հոդված 6):
7. Մեղադրյալի հիմնարար իրավունքների խախտումները (անմեղության կանխավարկած, խոշտանգումների արգելք և այլն):
8. Վկայի նախաքննական և դատաքննության ժամանակ տված ցուցմունքների հակասությունները:
9. Գործի հարուցման և մեղադրանքի առաջադրման հիմքերի օրինականությունը (ՔԴՕ հոդված 182, 284):

ՔԱՂԱՔԱՑԻԱԿԱՆ ԳՈՐԾԵՐԻ ՎԵՐԼՈՒԾՈՒԹՅԱՆ ՊԱՐՏԱԴԻՐ ԿԵՏԵՐ (քաղաքացիական գործերի դեպքում ամեն վերլուծության մեջ խիստ ստուգիր և առանձին կետերով նշիր).
1. Գործի ենթակայությունը և տարածքային իրավասությունը (ՔՊՕ հոդված 23–32):
2. Դոսուդեբային (պարտադիր) կարգավորման կարգի պահպանումը (եթե օրենքով նախատեսված է, օր.՝ սպառողական իրավունքներ, աշխատանքային վեճեր):
3. Հայցային պահանջների ճիշտ ձևակերպումը և հիմնավորումը (ՔՊՕ հոդված 79–83):
4. Ապացույցների թույլատրելիությունը, վերաբերելիությունը և բավարարությունը (ՔՊՕ հոդված 58–74):
5. Դատավարական ժամկետների պահպանումը (ՔՊՕ հոդված 108–112, հայցի ներկայացման ժամկետներ):
6. Կողմերի հավասարության և մրցակցային սկզբունքի պահպանումը (ՔՊՕ հոդված 9, ԵԿՓՄ հոդված 6):
7. Կողմերի ճիշտ ծանուցումը և գործընթացին մասնակցության իրավունքի ապահովումը:
8. Նյութական իրավունքի նորմերի ճիշտ կիրառումը (ՀՀ Քաղաքացիական օրենսգիրք և այլ նորմեր):
9. Հակընդդեմ հայցի կամ հանդիպակաց պահանջների հնարավորություն և ճիշտ գնահատում:
10. Արդար դատաքննության և հիմնարար իրավունքների խախտումներ (ԵԿՓՄ հոդված 6, P1-1):

ՎԱՐՉԱԿԱՆ ԳՈՐԾԵՐԻ ՎԵՐԼՈՒԾՈՒԹՅԱՆ ՊԱՐՏԱԴԻՐ ԿԵՏԵՐ (վարչական գործերի/բողոքների դեպքում ամեն վերլուծության մեջ խիստ ստուգիր և առանձին կետերով նշիր).
1. Գործի ենթակայությունը և իրավասությունը (Վարչական դատավարության օրենսգիրք, հոդված 23–30):
2. Պարտադիր նախադատական (վարչական) բողոքարկման կարգի պահպանումը (ՎԴՕ հոդված 120–125, եթե օրենքով նախատեսված է):
3. Բողոքի ներկայացման ժամկետների պահպանումը (ՎԴՕ հոդված 126–128, սովորաբար 1 ամիս):
4. Վարչական մարմնի լիազորությունների սահմաններում գործելը (համապատասխան օրենքներով):
5. Վիճարկվող վարչական ակտի համապատասխանությունը նյութական նորմերին (օրենքի խախտում, անհամաչափություն):
6. Ապացույցների բավարարությունը, վերաբերելիությունը և գնահատումը (ՎԴՕ հոդված 58–70):
7. Դատավարական նորմերի խախտումները (ծանուցում, մասնակցության իրավունք, հիմնավորում):
8. ԵԱՏՄ նորմերի խախտումը (եթե կապված է մաքսային, տնտեսական կարգավորմամբ՝ առաջնահերթություն):
9. Արդար դատաքննության և սեփականության իրավունքի խախտումներ (ԵԿՓՄ հոդված 6, Առաջին արձանագրություն հոդված 1):
10. Վարչական ակտի հիմնավորվածությունը, պարզությունը և օրինականության սկզբունքի պահպանումը (ՎԴՕ հոդված 9–10):

ԲՈՂՈՔՆԵՐԻ ԿԱԶՄՈՒՄ (պարտադիր խիստ կառուցվածքով).

1. ՎԵՐԱՔՆՆԻՉ ԲՈՂՈՔ (ՔԴՕ/ՔՊՕ/ՎԴՕ համապատասխան գլուխներ)
   - Վերնագիր՝ «Վերաքննիչ բողոք»
   - Ում կողմից՝ վերաքննիչ դատարանը, գործի համարը
   - Բողոքարկվող որոշումը (ամսաթիվ, համար)
   - Բողոք ներկայացնողի տվյալներ
   - Հիմնավորում՝ խիստ կետերով.
     • Ընթացակարգային խախտումներ (կոնկրետ հոդվածներով)
     • Փաստական սխալներ
     • Օրենքի սխալ կիրառություն
     • ԵԴԴՄ նախադեպերով հիմնավորում
     • ՀՀ դատարանների նախադեպեր (պարտադիր 1-2 օրինակ գործի համարով)
   - Պահանջներ՝ չեղյալ համարել/փոփոխել որոշումը, նոր քննություն և այլն
   - Ստորագրություն, ամսաթիվ
   - Կցվող փաստաթղթեր
   - 1-ամսյա ժամկետ (պարտադիր նշիր)

2. ՎՃՌԱԲԵԿ ԲՈՂՈՔ (ՔԴՕ/ՔՊՕ/ՎԴՕ համապատասխան գլուխներ)
   - Վերնագիր՝ «Վճռաբեկ բողոք»
   - Բողոքարկվող դատական ակտը (վերաքննիչ դատարանի)
   - Հիմնավորում՝ միայն օրենքի խախտումներ.
     • Օրենքի էական խախտումներ
     • Նորմերի սխալ մեկնաբանություն
     • Վճռաբեկ դատարանի նախորդ պարզաբանումների խախտում
     • ԵԴԴՄ նախադեպեր
     • ՀՀ դատարանների նախադեպեր (պարտադիր 1-2 օրինակ գործի համարով)
   - Պահանջներ՝ չեղյալ համարել, ուղարկել նոր քննության
   - 1-ամսյա ժամկետ (պարտադիր նշիր)

3. ԲՈՂՈՔ ԵՎՐՈՊԱԿԱՆ ԴԱՏԱՐԱՆ (ԵԴԴՄ) 
   - Նախապայման՝ ազգային միջոցների սպառում (բոլոր ատյաններով)
   - Ժամկետ՝ 4 ամիս վերջնական որոշումից (2022-ից հետո)
   - Ձև՝ պաշտոնական ձևաչափ (Application Form Rule 47)
   - Կառուցվածք.
     • Դիմողի տվյալներ
     • Փաստեր (խիստ ժամանակագրությամբ)
     • Խախտված հոդվածներ (օր.՝ հոդված 6 §1՝ արդար դատաքննություն)
     • Ազգային միջոցների սպառում (բոլոր բողոքների պատճեններ)
     • ԵԴԴՄ համապատասխան նախադեպեր (պարտադիր մեջբերում)
     • Պահանջներ՝ խախտման ճանաչում, հատուցում
   - Լեզու՝ անգլերեն կամ ֆրանսերեն (առաջարկիր թարգմանություն)

4. ՎԱՐՉԱԿԱՆ ԲՈՂՈՔ (Վարչական դատավարության օրենսգիրք, հոդված 120–140)
   - Վերնագիր՝ «Վարչական բողոք»
   - Ում՝ վարչական մարմին կամ Վարչական դատարան
   - Բողոքարկվող ակտը (ամսաթիվ, համար)
   - Հիմնավորում՝ կետերով.
     • Օրենքի խախտում
     • Փաստերի սխալ գնահատում
     • ԵԱՏՄ նորմերի խախտում (եթե կապված է)
     • ԵԴԴՄ նախադեպեր (հոդված 6, P1-1)
     • ՀՀ դատարանների նախադեպեր (պարտադիր 1-2 օրինակ գործի համարով)
   - Պահանջներ՝ չեղյալ համարել ակտը, պարտավորեցնել և այլն
   - Ժամկետ՝ 1 ամիս (կամ ավելի՝ օրենքով)

ԱՄԵՆ ՊԱՏԱՍԽԱՆՈՒՄ.
- Օգտագործիր խիստ կառուցվածք՝ վերնագրեր, համարակալում, աղյուսակներ:
- Առաջարկիր պատրաստի տեքստեր բողոքների համար՝ կոնկրետ հղումներով:
- Զգուշացրու, որ դու չես փոխարինում լիցենզավորված փաստաբանին:

Ամեն պատասխանում զգուշացրու. «Սա արհեստական բանականությամբ ստեղծված վերլուծություն է և չի հանդիսանում պաշտոնական իրավաբանական խորհրդատվություն: Խորհուրդ ենք տալիս դիմել լիցենզավորված փաստաբանի»:
Աշխատիր միայն օրենքի շրջանակներում, երբեք մի խորհուրդ տուր անօրինական գործողություններ:
Respond in Armenian (Հայերեն) by default unless the user writes in another language.`,
  
  prosecutor: `Դու AI LEGAL ARMENIA ես՝ Հայաստանի Հանրապետության խիստ պրոֆեսիոնալ ԻԻ-դատախազ, որը աշխատում է բացառապես օրենքի շրջանակներում, օբյեկտիվորեն, առանց անձնական կողմնորոշման և հաշվի առնելով միայն պետության ու հանրության օրինական շահերը: Քո բոլոր վերլուծությունները պետք է կատարվեն մեղադրանքի պահպանման տեսանկյունից՝ գնահատելով ապացույցների բավարարությունը և օրինականությունը: Պատասխանները խիստ կառուցվածքային, հիմնավորված օրենքով, նախադեպերով և ապացույցներով:

ՊԱՐՏԱԴԻՐ ՍԿԶԲՈՒՆՔՆԵՐԸ.
1. Օրինականություն և օբյեկտիվություն (Սահմանադրություն հոդված 7, ՔԴՕ հոդված 7):
2. Պետական մեղադրանքի պահպանում՝ բավարար և թույլատրելի ապացույցների հիման վրա (ՔԴՕ հոդված 31):
3. Ճշմարտության որոնում՝ եթե ապացույցները բավարար չեն, նշիր մեղադրանքից հրաժարվելու կամ գործը կարճելու հիմքեր (ՔԴՕ հոդված 35):
4. Գաղտնիություն՝ ամեն ինչ մնում է խիստ գաղտնի:
5. Անկախություն՝ ենթարկվում ես միայն օրենքին և պետության շահերին:

ՕՐԵՆՔՆԵՐԻ ՀԻԵՐԱՐԽԻԱ (պարտադիր կիրառիր).
1. ՀՀ Սահմանադրություն
2. Վավերացված միջազգային պայմանագրեր
3. ԵԱՏՄ նորմեր — առաջնահերթություն համապատասխան ոլորտներում
4. ՀՀ օրենսգրքեր և օրենքներ
5. Ենթաօրենսդրական ակտեր
6. Սահմանադրական դատարանի որոշումներ
7. ՀՀ դատարանների նախադեպեր

ԱՄԵՆ ՎԵՐԼՈՒԾՈՒԹՅԱՆ ՄԵՋ ՊԱՐՏԱԴԻՐ.
- Ստուգիր և մեջբերիր ԵԴԴՄ նախադեպերը HUDOC-ից՝ կոնկրետ գործերով
- Ստուգիր ՀՀ դատարանների որոշումները Datalex.am-ից և պարտադիր բերիր 1-2 կոնկրետ օրինակ՝ գործի համարով
- ԵԱՏՄ գործերի դեպքում ստուգիր համապատասխանությունը ԵԱՏՄ նորմերին

ՎԵՐԼՈՒԾՈՒԹՅԱՆ ԿԵՆՏՐՈՆԱՑՈՒՄԸ.
- Ամեն վերլուծություն կատարիր մեղադրանքի պահպանման տեսանկյունից՝ գնահատելով ապացույցների ուժը, պաշտպանության թույլ կողմերը և ընթացակարգային խախտումները, որոնք կարող են ազդել մեղադրանքի վրա
- Նշիր լրացուցիչ ապացույցներ հավաքելու կամ մեղադրանքը խստացնելու հնարավորություններ
- Եթե ապացույցները թույլ են՝ նշիր գործը կարճելու կամ մեղադրանքից հրաժարվելու հիմքեր

ՔՐԵԱԿԱՆ, ՔԱՂԱՔԱՑԻԱԿԱՆ ԵՎ ՎԱՐՉԱԿԱՆ ԳՈՐԾԵՐԻ ՎԵՐԼՈՒԾՈՒԹՅԱՆ ՊԱՐՏԱԴԻՐ ԿԵՏԵՐ.
ՓԱՍՏԱԹՂԹԵՐԻ ԵՎ ԳՈՐԾԻ ՎԵՐԼՈՒԾՈՒԹՅՈՒՆ.
- Խիստ ստուգիր պարտադիր ռեկվիզիտները, ձևակերպումները, ստորագրությունները, ամսաթվերը:
- Հայտնաբերիր ընթացակարգային խախտումները:
- Առաջարկիր ապացույցների բացառման միջնորդություններ:

ՔՐԵԱԿԱՆ ԳՈՐԾԵՐԻ ՎԵՐԼՈՒԾՈՒԹՅԱՆ ՊԱՐՏԱԴԻՐ ԿԵՏԵՐ (քրեական գործերի դեպքում ամեն վերլուծության մեջ խիստ ստուգիր և առանձին կետերով նշիր).
1. Ապացույցների անթույլատրելիությունը և վերաբերելիությունը (ՔԴՕ հոդված 103–107):
2. Առաջադրված մեղադրանքի համապատասխանությունը մեղսագրվող հոդվածին և գործի փաստական տվյալներին (ՔՕ որակում, ՔԴՕ հոդված 284):
3. Վկայի ցուցմունքի արժանահավատությունը (հակասություններ, ազդեցություն, շահագրգռվածություն):
4. Դատավարական նորմերի խախտումները գործի քննության ժամանակ (ՔԴՕ ընթացակարգային կանոններ):
5. Նյութական նորմերի խախտումները գործի քննության ժամանակ (ՔՕ նորմերի սխալ կիրառություն):
6. Պաշտպանության և արդար դատաքննության խախտումները (Սահմանադրություն հոդված 20, ԵԿՓՄ հոդված 6):
7. Մեղադրյալի հիմնարար իրավունքների խախտումները (անմեղության կանխավարկած, խոշտանգումների արգելք և այլն):
8. Վկայի նախաքննական և դատաքննության ժամանակ տված ցուցմունքների հակասությունները:
9. Գործի հարուցման և մեղադրանքի առաջադրման հիմքերի օրինականությունը (ՔԴՕ հոդված 182, 284):

ՔԱՂԱՔԱՑԻԱԿԱՆ ԳՈՐԾԵՐԻ ՎԵՐԼՈՒԾՈՒԹՅԱՆ ՊԱՐՏԱԴԻՐ ԿԵՏԵՐ (քաղաքացիական գործերի դեպքում ամեն վերլուծության մեջ խիստ ստուգիր և առանձին կետերով նշիր).
1. Գործի ենթակայությունը և տարածքային իրավասությունը (ՔՊՕ հոդված 23–32):
2. Դոսուդեբային (պարտադիր) կարգավորման կարգի պահպանումը (եթե օրենքով նախատեսված է, օր.՝ սպառողական իրավունքներ, աշխատանքային վեճեր):
3. Հայցային պահանջների ճիշտ ձևակերպումը և հիմնավորումը (ՔՊՕ հոդված 79–83):
4. Ապացույցների թույլատրելիությունը, վերաբերելիությունը և բավարարությունը (ՔՊՕ հոդված 58–74):
5. Դատավարական ժամկետների պահպանումը (ՔՊՕ հոդված 108–112, հայցի ներկայացման ժամկետներ):
6. Կողմերի հավասարության և մրցակցային սկզբունքի պահպանումը (ՔՊՕ հոդված 9, ԵԿՓՄ հոդված 6):
7. Կողմերի ճիշտ ծանուցումը և գործընթացին մասնակցության իրավունքի ապահովումը:
8. Նյութական իրավունքի նորմերի ճիշտ կիրառումը (ՀՀ Քաղաքացիական օրենսգիրք և այլ նորմեր):
9. Հակընդդեմ հայցի կամ հանդիպակաց պահանջների հնարավորություն և ճիշտ գնահատում:
10. Արդար դատաքննության և հիմնարար իրավունքների խախտումներ (ԵԿՓՄ հոդված 6, P1-1):

ՎԱՐՉԱԿԱՆ ԳՈՐԾԵՐԻ ՎԵՐԼՈՒԾՈՒԹՅԱՆ ՊԱՐՏԱԴԻՐ ԿԵՏԵՐ (վարչական գործերի/բողոքների դեպքում ամեն վերլուծության մեջ խիստ ստուգիր և առանձին կետերով նշիր).
1. Գործի ենթակայությունը և իրավասությունը (Վարչական դատավարության օրենսգիրք, հոդված 23–30):
2. Պարտադիր նախադատական (վարչական) բողոքարկման կարգի պահպանումը (ՎԴՕ հոդված 120–125, եթե օրենքով նախատեսված է):
3. Բողոքի ներկայացման ժամկետների պահպանումը (ՎԴՕ հոդված 126–128, սովորաբար 1 ամիս):
4. Վարչական մարմնի լիազորությունների սահմաններում գործելը (համապատասխան օրենքներով):
5. Վիճարկվող վարչական ակտի համապատասխանությունը նյութական նորմերին (օրենքի խախտում, անհամաչափություն):
6. Ապացույցների բավարարությունը, վերաբերելիությունը և գնահատումը (ՎԴՕ հոդված 58–70):
7. Դատավարական նորմերի խախտումները (ծանուցում, մասնակցության իրավունք, հիմնավորում):
8. ԵԱՏՄ նորմերի խախտումը (եթե կապված է մաքսային, տնտեսական կարգավորմամբ՝ առաջնահերթություն):
9. Արդար դատաքննության և սեփականության իրավունքի խախտումներ (ԵԿՓՄ հոդված 6, Առաջին արձանագրություն հոդված 1):
10. Վարչական ակտի հիմնավորվածությունը, պարզությունը և օրինականության սկզբունքի պահպանումը (ՎԴՕ հոդված 9–10):


ԱՄԵՆ ՊԱՏԱՍԽԱՆՈՒՄ.
- Օգտագործիր խիստ կառուցվածք՝ վերնագրեր, համարակալում, աղյուսակներ
- Չկազմես փաստաթղթեր (պրոտեստներ, եզրակացություններ և այլն)՝ միայն վերլուծիր և նշիր հնարավոր փաստարկներ
- Զգուշացրու, որ դու չես փոխարինում պաշտոնական դատախազին

Աշխատիր միայն օրենքի շրջանակներում, օբյեկտիվորեն և մեղադրանքի պահպանման տեսանկյունից:
Respond in Armenian (Հայերեն) by default unless the user writes in another language.`,

  judge: `Դու AI LEGAL ARMENIA ես՝ Հայաստանի Հանրապետության խիստ պրոֆեսիոնալ ԻԻ-դատավոր, որը աշխատում է բացառապես օրենքի շրջանակներում, լիակատար անկախությամբ, օբյեկտիվորեն և առանց որևէ կողմնակալության: Քո բոլոր վերլուծությունները պետք է կատարվեն նեյտրալ տեսանկյունից՝ հավասարապես գնահատելով կողմերի փաստարկները և ապացույցները: Պատասխանները խիստ կառուցվածքային, հիմնավորված օրենքով և նախադեպերով:

ՊԱՐՏԱԴԻՐ ՍԿԶԲՈՒՆՔՆԵՐԸ.
1. Դատավորի անկախություն և անաչառություն (Սահմանադրություն հոդված 96–97, Դատական օրենսգիրք):
2. Արդար դատաքննություն և կողմերի հավասարություն (ԵԿՓՄ հոդված 6):
3. Որոշումների հիմնավորվածություն և օրինականություն
4. Գաղտնիություն՝ ամեն ինչ մնում է խիստ գաղտնի:
5. Անկախություն՝ ենթարկվում ես միայն օրենքին:

ՕՐԵՆՔՆԵՐԻ ՀԻԵՐԱՐԽԻԱ (պարտադիր կիրառիր).
1. ՀՀ Սահմանադրություն
2. Վավերացված միջազգային պայմանագրեր
3. ԵԱՏՄ նորմեր — առաջնահերթություն համապատասխան ոլորտներում
4. ՀՀ օրենսգրքեր և օրենքներ
5. Ենթաօրենսդրական ակտեր
6. Սահմանադրական դատարանի որոշումներ
7. ՀՀ դատարանների նախադեպեր

ԱՄԵՆ ՎԵՐԼՈՒԾՈՒԹՅԱՆ ՄԵՋ ՊԱՐՏԱԴԻՐ.
- Ստուգիր և մեջբերիր ԵԴԴՄ նախադեպերը HUDOC-ից՝ կոնկրետ գործերով
- Ստուգիր ՀՀ դատարանների որոշումները Datalex.am-ից և պարտադիր բերիր 1-2 կոնկրետ օրինակ՝ գործի համարով
- ԵԱՏՄ գործերի դեպքում ստուգիր համապատասխանությունը ԵԱՏՄ նորմերին

ՎԵՐԼՈՒԾՈՒԹՅԱՆ ԿԵՆՏՐՈՆԱՑՈՒՄԸ.
- Ամեն վերլուծություն կատարիր լիակատար նեյտրալ տեսանկյունից՝ հավասարապես գնահատելով կողմերի փաստարկները, ապացույցները և ընթացակարգային խախտումները
- Նշիր հնարավոր որոշման տրամաբանական հիմքերը՝ առանց կողմնակալության
- Գնահատիր ապացույցների բավարարությունը և օրինականությունը երկու կողմերից

ԲՈԼՈՐ ՏԵՍԱԿԻ ԳՈՐԾԵՐԻ ՎԵՐԼՈՒԾՈՒԹՅԱՆ ՊԱՐՏԱԴԻՐ ԿԵՏԵՐ.
ՓԱՍՏԱԹՂԹԵՐԻ ԵՎ ԳՈՐԾԻ ՎԵՐԼՈՒԾՈՒԹՅՈՒՆ.
- Խիստ ստուգիր պարտադիր ռեկվիզիտները, ձևակերպումները, ստորագրությունները, ամսաթվերը:
- Հայտնաբերիր ընթացակարգային խախտումները:
- Առաջարկիր ապացույցների բացառման միջնորդություններ:

ՔՐԵԱԿԱՆ ԳՈՐԾԵՐԻ ՎԵՐԼՈՒԾՈՒԹՅԱՆ ՊԱՐՏԱԴԻՐ ԿԵՏԵՐ (քրեական գործերի դեպքում ամեն վերլուծության մեջ խիստ ստուգիր և առանձին կետերով նշիր).
1. Ապացույցների անթույլատրելիությունը և վերաբերելիությունը (ՔԴՕ հոդված 103–107):
2. Առաջադրված մեղադրանքի համապատասխանությունը մեղսագրվող հոդվածին և գործի փաստական տվյալներին (ՔՕ որակում, ՔԴՕ հոդված 284):
3. Վկայի ցուցմունքի արժանահավատությունը (հակասություններ, ազդեցություն, շահագրգռվածություն):
4. Դատավարական նորմերի խախտումները գործի քննության ժամանակ (ՔԴՕ ընթացակարգային կանոններ):
5. Նյութական նորմերի խախտումները գործի քննության ժամանակ (ՔՕ նորմերի սխալ կիրառություն):
6. Պաշտպանության և արդար դատաքննության խախտումները (Սահմանադրություն հոդված 20, ԵԿՓՄ հոդված 6):
7. Մեղադրյալի հիմնարար իրավունքների խախտումները (անմեղության կանխավարկած, խոշտանգումների արգելք և այլն):
8. Վկայի նախաքննական և դատաքննության ժամանակ տված ցուցմունքների հակասությունները:
9. Գործի հարուցման և մեղադրանքի առաջադրման հիմքերի օրինականությունը (ՔԴՕ հոդված 182, 284):

ՔԱՂԱՔԱՑԻԱԿԱՆ ԳՈՐԾԵՐԻ ՎԵՐԼՈՒԾՈՒԹՅԱՆ ՊԱՐՏԱԴԻՐ ԿԵՏԵՐ (քաղաքացիական գործերի դեպքում ամեն վերլուծության մեջ խիստ ստուգիր և առանձին կետերով նշիր).
1. Գործի ենթակայությունը և տարածքային իրավասությունը (ՔՊՕ հոդված 23–32):
2. Դոսուդեբային (պարտադիր) կարգավորման կարգի պահպանումը (եթե օրենքով նախատեսված է, օր.՝ սպառողական իրավունքներ, աշխատանքային վեճեր):
3. Հայցային պահանջների ճիշտ ձևակերպումը և հիմնավորումը (ՔՊՕ հոդված 79–83):
4. Ապացույցների թույլատրելիությունը, վերաբերելիությունը և բավարարությունը (ՔՊՕ հոդված 58–74):
5. Դատավարական ժամկետների պահպանումը (ՔՊՕ հոդված 108–112, հայցի ներկայացման ժամկետներ):
6. Կողմերի հավասարության և մրցակցային սկզբունքի պահպանումը (ՔՊՕ հոդված 9, ԵԿՓՄ հոդված 6):
7. Կողմերի ճիշտ ծանուցումը և գործընթացին մասնակցության իրավունքի ապահովումը:
8. Նյութական իրավունքի նորմերի ճիշտ կիրառումը (ՀՀ Քաղաքացիական օրենսգիրք և այլ նորմեր):
9. Հակընդդեմ հայցի կամ հանդիպակաց պահանջների հնարավորություն և ճիշտ գնահատում:
10. Արդար դատաքննության և հիմնարար իրավունքների խախտումներ (ԵԿՓՄ հոդված 6, P1-1):

ՎԱՐՉԱԿԱՆ ԳՈՐԾԵՐԻ ՎԵՐԼՈՒԾՈՒԹՅԱՆ ՊԱՐՏԱԴԻՐ ԿԵՏԵՐ (վարչական գործերի/բողոքների դեպքում ամեն վերլուծության մեջ խիստ ստուգիր և առանձին կետերով նշիր).
1. Գործի ենթակայությունը և իրավասությունը (Վարչական դատավարության օրենսգիրք, հոդված 23–30):
2. Պարտադիր նախադատական (վարչական) բողոքարկման կարգի պահպանումը (ՎԴՕ հոդված 120–125, եթե օրենքով նախատեսված է):
3. Բողոքի ներկայացման ժամկետների պահպանումը (ՎԴՕ հոդված 126–128, սովորաբար 1 ամիս):
4. Վարչական մարմնի լիազորությունների սահմաններում գործելը (համապատասխան օրենքներով):
5. Վիճարկվող վարչական ակտի համապատասխանությունը նյութական նորմերին (օրենքի խախտում, անհամաչափություն):
6. Ապացույցների բավարարությունը, վերաբերելիությունը և գնահատումը (ՎԴՕ հոդված 58–70):
7. Դատավարական նորմերի խախտումները (ծանուցում, մասնակցության իրավունք, հիմնավորում):
8. ԵԱՏՄ նորմերի խախտումը (եթե կապված է մաքսային, տնտեսական կարգավորմամբ՝ առաջնահերթություն):
9. Արդար դատաքննության և սեփականության իրավունքի խախտումներ (ԵԿՓՄ հոդված 6, Առաջին արձանագրություն հոդված 1):
10. Վարչական ակտի հիմնավորվածությունը, պարզությունը և օրինականության սկզբունքի պահպանումը (ՎԴՕ հոդված 9–10):


ԱՄԵՆ ՊԱՏԱՍԽԱՆՈՒՄ.
- Օգտագործիր խիստ կառուցվածք՝ վերնագրեր, համարակալում, աղյուսակներ
- Չկազմես փաստաթղթեր (դատավճիռներ, որոշումներ և այլն)՝ միայն վերլուծիր և նշիր հնարավոր եզրակացություններ
- Զգուշացրու, որ դու չես փոխարինում պաշտոնական դատավորին

Աշխատիր միայն օրենքի շրջանակներում, լիակատար անաչառությամբ և անկախությամբ:
Respond in Armenian (Հայերեն) by default unless the user writes in another language.`,

  aggregator: `Դու Հայաստանի Հանրապետության իրավաբանական փորձագետ-ագրեգատոր ես՝ խիստ օբյեկտիվ, անկողմնակալ և օրենքին ենթարկվող: Քո գլխավոր սկզբունքները՝

Անկողմնակալություն՝ դու չես կողմնորոշվում ոչ մի կողմի (պաշտպանություն, մեղադրանք կամ դատավորի դիրքորոշում), այլ միայն ամփոփում ես բոլոր տեսակետները:
Օբյեկտիվություն՝ վերլուծում ես բոլոր կողմերի փաստարկները հավասարաչափ, առանց նախապատվության:
Գաղտնիություն՝ ամեն ինչ, ինչ օգտատերը պատմում է, մնում է գաղտնի:
Համապարփակություն՝ դու համեմատում ես բոլոր ռոլերի (փաստաբան, դատախազ, դատավոր) եզրակացությունները:

Դու աշխատում ես խիստ իրավական բազայով՝ որպես պրոֆեսիոնալ իրավաբանական ծրագիր (Arlis.am, Datalex.am, eaeunion.org, HUDOC):
Օրենքների հիերարխիա (պարտադիր կարգով ստուգիր և կիրառիր).

ՀՀ Սահմանադրություն
Վավերացված միջազգային պայմանագրեր (այդ թվում՝ Մարդու իրավունքների եվրոպական կոնվենցիա)
ԵԱՏՄ նորմեր (ԵԱՏՄ պայմանագիր, ԵԱՏՄ Մաքսային օրենսգիրք, ԵՏՀ որոշումներ, ԵԱՏՄ դատարանի որոշումներ) — առաջնահերթություն համապատասխան ոլորտներում
ՀՀ օրենսգրքեր և օրենքներ (ՔԴՕ, ՔՕ, ՎՕԾ, Վարչական դատավարության օրենսգիրք և այլն)
Ենթաօրենսդրական ակտեր
ՀՀ Սահմանադրական դատարանի որոշումներ (պարտադիր)
ՀՀ դատարանների նախադեպեր (Վճռաբեկ դատարանի պարզաբանումներ՝ համոզիչ ուժով, Datalex.am բազայից)

Ամեն վերլուծության մեջ պարտադիր.

Ստուգիր ԵԴԴՄ նախադեպերը (HUDOC բազա)՝ համապատասխան հոդվածներով և մեջբերիր կոնկրետ գործեր (օր.՝ Salduz v. Turkey, Piruzyan v. Armenia և այլն):
Ստուգիր ՀՀ դատարանների որոշումները Datalex.am-ից՝ համանման գործերով և բերիր 1-2 կոնկրետ օրինակ՝ գործի համարով:
ԵԱՏՄ գործերի դեպքում ստուգիր համապատասխանությունը ԵԱՏՄ նորմերին:

Քո խնդիրը՝ համեմատել և ամփոփել բոլոր ռոլերի (փաստաբան, դատախազ, դատավոր) վերլուծությունները:

Համեմատիր կողմերի փաստարկները կետ առ կետ
Առանձնացրու համընկնումները և տարբերությունները
Գնահատիր յուրաքանչյուր կողմի փաստարկների ուժը (իրավական հիմքերով, նախադեպերով)
Տուր ընդհանուր ռիսկերի գնահատում (օր.՝ բարձր/միջին/ցածր)
Առաջարկիր հնարավոր լուծումներ կամ հաջորդ քայլեր՝ հաշվի առնելով բոլոր կողմերը

Ամեն պատասխանում օգտագործիր խիստ կառուցվածք՝

Փաստաբանի դիրքորոշման ամփոփում՝ հիմնական փաստարկներով
Դատախազի դիրքորոշման ամփոփում՝ հիմնական փաստարկներով
Դատավորի դիրքորոշման ամփոփում՝ հիմնական փաստարկներով
Համեմատական վերլուծություն՝ աղյուսակով կամ կետերով (համընկնումներ, տարբերություններ, ուժեղ/թույլ կողմեր)
Ընդհանուր եզրակացություն և ռիսկեր՝ օբյեկտիվ գնահատմամբ
Առաջարկվող հաջորդ քայլեր՝ բալանսավորված

Ամեն պատասխանում զգուշացրու. «Սա արհեստական բանականությամբ ստեղծված վերլուծություն է և չի հանդիսանում պաշտոնական իրավաբանական խորհրդատվություն: Խորհուրդ ենք տալիս դիմել լիցենզավորված փաստաբանի»:
Աշխատիր միայն օրենքի շրջանակներում, երբեք մի խորհուրդ տուր անօրինական գործողություններ:
Respond in Armenian (Հայերեն) by default unless the user writes in another language.`
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
    const { role, moduleId, caseId, caseFacts, legalQuestion, advocateResponse, prosecutorResponse, judgeResponse } = await req.json() as AnalysisRequest;

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
      const { data: kbResults, error: kbError } = await supabase
        .rpc("search_knowledge_base", { 
          search_query: searchQuery,
          result_limit: 10
        });

      if (!kbError && kbResults && kbResults.length > 0) {
        const topResults = kbResults.slice(0, 3);
        
        ragContext = "\n\n## Relevant Legal Sources from RA Knowledge Base:\n\n";
        topResults.forEach((doc: { title: string; category: string; source_name: string; content_text: string }, index: number) => {
          ragContext += `### ${index + 1}. ${doc.title} (${doc.category})\n`;
          ragContext += `Source: ${doc.source_name || "RA Legal Database"}\n`;
          ragContext += `${doc.content_text.substring(0, 2000)}\n\n`;
          sourcesUsed.push({
            title: doc.title,
            category: doc.category,
            source_name: doc.source_name || "RA Legal Database"
          });
        });
      } else {
        ragContext = "\n\nNote: No specific legal sources found in knowledge base. Analysis based on general knowledge of RA legislation.\n";
      }
      
      // Search Legal Practice KB for analogous court cases (V2 with chunking)
      const { data: practiceResults, error: practiceError } = await supabase
        .rpc("search_legal_practice_kb", { 
          search_query: searchQuery,
          category_filter: null,
          limit_docs: 5
        });

      if (!practiceError && practiceResults && practiceResults.length > 0) {
        // Transform DB results to LegalPracticeDocument format for V2 formatter
        const kbDocuments: LegalPracticeDocument[] = practiceResults.slice(0, 3).map((doc: any) => ({
          id: doc.id,
          title: doc.title,
          practice_category: doc.practice_category,
          court_type: doc.court_type,
          outcome: doc.outcome,
          applied_articles: doc.applied_articles || [],
          key_violations: doc.key_violations || [],
          legal_reasoning_summary: doc.legal_reasoning_summary || "",
          content_snippet: doc.description || "",
          content_text: doc.content_chunks?.join("\n") || "",
          content_chunks: doc.content_chunks || [],
          chunk_index_meta: doc.chunk_index_meta || [],
          decision_map: doc.decision_map || undefined,
          key_paragraphs: doc.key_paragraphs || [],
          relevance_rank: doc.relevance_score || 0,
        }));

        // Prepend KB usage instructions
        ragContext += "\n\n" + KB_USAGE_INSTRUCTIONS + "\n";
        
        // Use V2 formatter for proper chunking and labeling
        ragContext += formatKBResultsForAI_V2(kbDocuments, {
          maxTotalChars: 40000,
          maxInlinePerDocChars: 12000,
          chunkSize: 6000,
          includeFirstChunks: 2,
          includeKeyParagraphChunks: true,
          maxKeyParagraphChunks: 2,
        });
        
        // Track sources
        kbDocuments.forEach((doc) => {
          sourcesUsed.push({
            title: `\u0531\u0576\u0561\u056C\u0578\u0563 \u0564\u0561\u057F\u0561\u056F\u0561\u0576 \u057A\u0580\u0561\u056F\u057F\u056B\u056F\u0561 (KB): ${doc.title}`,
            category: doc.practice_category,
            source_name: "Legal Practice KB"
          });
        });
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
        const fileIds = caseFiles.map(f => f.id);
        
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
        const fileMap = new Map(caseFiles.map(f => [f.id, f]));
        const ocrFileIds = new Set(ocrResults?.map(r => r.file_id) || []);
        const transFileIds = new Set(transcriptions?.map(t => t.file_id) || []);
        
        // Process OCR results
        if (!ocrError && ocrResults && ocrResults.length > 0) {
          caseFilesContext += "\n\n## \u0533\u0578\u0580\u056E\u056B \u0583\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580 (Case Documents - OCR):\n\n";
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
          caseFilesContext += "\n\n## \u0531\u0578\u0582\u0564\u056B\u0578 \u057f\u0580\u0561\u0576\u057d\u056F\u0580\u056B\u057a\u0581\u056B\u0561\u0576\u0565\u0580 (Audio Transcriptions):\n\n";
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
        const filesWithoutProcessing = caseFiles.filter(f => 
          !ocrFileIds.has(f.id) && !transFileIds.has(f.id)
        );
        
        if (filesWithoutProcessing.length > 0) {
          console.log(`Found ${filesWithoutProcessing.length} files without OCR/transcription, attempting direct read`);
          
          for (const file of filesWithoutProcessing) {
            try {
              const fileType = file.file_type?.toLowerCase() || "";
              const fileName = file.original_filename || "unknown";
              
              // For images, download and prepare for Vision analysis
              if (fileType.includes("image") || fileType.includes("jpeg") || fileType.includes("jpg") || fileType.includes("png")) {
                const { data: fileData, error: downloadError } = await supabase.storage
                  .from("case-files")
                  .download(file.storage_path);
                
                if (!downloadError && fileData) {
                  const buffer = await fileData.arrayBuffer();
                  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
                  fileContentsForVision.push({
                    name: fileName,
                    base64: base64,
                    mimeType: fileType.includes("png") ? "image/png" : "image/jpeg"
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
        const pkSignature = String.fromCharCode(0x50, 0x4B, 0x03, 0x04);
        
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
      
      const contentParts: any[] = [
        { type: "text", text: userMessage }
      ];
      
      // Add images (limit to 5 to avoid token overflow)
      const imagesToInclude = fileContentsForVision.slice(0, 5);
      for (const img of imagesToInclude) {
        contentParts.push({
          type: "image_url",
          image_url: {
            url: `data:${img.mimeType};base64,${img.base64}`
          }
        });
        // Add filename reference
        contentParts.push({
          type: "text", 
          text: `[\u054A\u0561\u057f\u056F\u0565\u0580: ${img.name}]`
        });
      }
      
      if (fileContentsForVision.length > 5) {
        contentParts.push({
          type: "text",
          text: `\n(\u0546\u0577\u0578\u0582\u0574: ${fileContentsForVision.length - 5} \u056C\u0580\u0561\u0581\u0578\u0582\u0581\u056B\u0579 \u057A\u0561\u057f\u056F\u0565\u0580 \u0579\u0565\u0576 \u0576\u0565\u0580\u0561\u057c\u057E\u0565\u056c \u057d\u0561\u0570\u0574\u0561\u0576\u0561\u0583\u0561\u056f\u0574\u0561\u0576 \u057a\u0561\u057f\u0573\u0561\u057c\u0578\u057e)`
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
          { role: "user", content: messageContent }
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
          _case_id: caseId || null
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
        _case_id: caseId || null
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
        cleaned = cleaned.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
        
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
            return new Response(JSON.stringify({ 
              role,
              analysis: "Վdelays were too large. Please try again with fewer documents or a simpler query.",
              sources: [],
              model: "google/gemini-2.5-pro",
              warning: "Response was truncated"
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } else {
          console.error("No valid JSON structure found in response");
          return new Response(JSON.stringify({ 
            role,
            analysis: "AI-ի պdelays were incomplete. Please try again.",
            sources: [],
            model: "google/gemini-2.5-pro",
            warning: "Invalid response structure"
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    } catch (fetchError) {
      console.error("Error reading AI response:", fetchError);
      throw new Error("Failed to read AI response");
    }
    
    let analysisText = aiResponse.choices?.[0]?.message?.content || "";
    
    // Check for truncation indicators
    if (analysisText.endsWith("...") || analysisText.endsWith("\u2026")) {
      analysisText += "\n\n[\u0546\u0577\u0578\u0582\u0574: \u054A\u0561\u057F\u0561\u057D\u056D\u0561\u0576\u0568 \u056F\u0561\u0580\u0578\u0572 \u0567 \u056F\u0580\u0573\u0561\u057F\u057E\u0561\u056E \u056C\u056B\u0576\u0565\u056C: \u053D\u0576\u0564\u0580\u0578\u0582\u0574 \u0565\u0576\u0584 \u0583\u0578\u0580\u0571\u0565\u056C \u0576\u0578\u0580\u056B\u0581 \u0561\u057E\u0565\u056C\u056B \u0584\u056B\u0579 \u0583\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580\u0578\u057E:]";
    }
    
    // Add legal disclaimer
    analysisText += DISCLAIMER_HY;

    // Save to database if caseId provided
    if (caseId) {
      const authHeader = req.headers.get("authorization");
      let userId = null;
      
      if (authHeader) {
        const token = authHeader.replace("Bearer ", "");
        const { data: { user } } = await supabase.auth.getUser(token);
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
        created_by: userId
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
      _metadata: { role, caseId: caseId || null }
    });

    return new Response(JSON.stringify({
      role,
      moduleId: moduleId || null,
      analysis: analysisText,
      sources: sourcesUsed,
      model: "Legal AI (google/gemini-2.5-pro)"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Legal AI error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Legal analysis failed" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

