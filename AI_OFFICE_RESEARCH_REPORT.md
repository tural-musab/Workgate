# AI TeamS - AI Software Office Research Report

Date: 2026-04-02
Prepared for: greenfield workspace at `/Users/turanmusabosman/Documents/projects/AI TeamS`

## 1. Executive Summary

Kisa cevap: Evet, bu proje A'dan Z'ye kurulabilir. Ama "butun ofisi tamamen otonom AI'a verelim" yaklasimi dogru baslangic degil. En saglam yol, once yazilim-ofisi benzeri dar bir cekirdek kurmak, bunu olculebilir bir sekilde dogrulamak, sonra diger operasyonlara acilmaktir.

Bu arastirmanin net sonucu:

- Fikir yeni degil. Benzer acik kaynakli frameworkler, coding-agent platformlari ve hatta "simule ofis" benchmarklari zaten var.
- Buna ragmen pazarda hala guclu bir bosluk var: "gercekten isletilebilir, izlenebilir, insan-onayli, maliyet kontrollu AI ofis sistemi" cok az.
- Bu projeyi farkli yapacak sey "daha fazla ajan" degil; rol sinirlari, tool sozlesmeleri, eval sistemi, insan kapilari ve audit izleri olacak.
- Teknik temel olarak benim ana onerim `LangGraph` sinifinda dusuk seviye, kontrol edilebilir bir orkestrasyon katmani kurmak. OpenAI-first gideceksen `OpenAI Agents SDK` de guclu bir alternatif.
- Uretim baslangici icin en saglam alan "AI software office" olur: arastirma, PRD taslagi, mimari opsiyonlari, issue cozum, test, dokumantasyon, review.
- Prod release, finans, hukuk, guvenlik onayi ve hassas browser/computer actions insansiz birakilmamali.

## 2. Workspace Assessment

Bu klasor su an teknik olarak bos:

- `rg --files` sonuc vermedi.
- Dizin bir git repo degil.
- Elle incelenen klasor yapisinda proje dosyasi yok.

Sonuc:

- Bu bir "mevcut repo analizi" degil, sifirdan kurulacak bir greenfield girisim/mimari calismasi.
- Ilk teslimat rapor ve karar mimarisi olmali.
- Sonraki adimda repo iskeleti, orkestrasyon runtime'i ve agent kontratlari olusturulabilir.

## 3. Piyasa ve Benzer Projeler

### 3.1 Acik Kaynak Framework ve Platformlar

| Proje | Tur | Neyi iyi yapiyor | Bu proje icin anlami |
| --- | --- | --- | --- |
| `LangGraph` | Orkestrasyon frameworku | Durumlu, uzun sureli, kontrol edilebilir ajan akislari; human-in-the-loop; memory | Uretim omurgasi icin en guclu adaylardan biri |
| `OpenAI Agents SDK` | Agent SDK | Handoff, tool use, tracing, code-first orkestrasyon | OpenAI-first mimari icin guclu secenek |
| `CrewAI` | Multi-agent framework | Rol bazli crew mantigi ve flow katmani ile hizli prototip | Hizli MVP icin iyi; cok dinamik sistemlerde dikkat ister |
| `AutoGen` | Multi-agent framework | Team/termination yapilari, agent chat ve deneysel akislari iyi | Arastirma ve kurumsal PoC icin degerli |
| `MetaGPT` | "AI software company" framework | PM, architect, engineer gibi rollerle yazilim sirketi metaforu | Dogrudan ilham kaynagi, ama uretim iskeleti olarak tek basina yeterli degil |
| `OpenHands` | Coding-agent platformu | Dosya sistemi, CLI, GitHub Action, headless calisma, coding workflows | Engineer agent / code execution katmani icin cok ilgili |

### 3.2 Benchmark ve Referans Sistemler

| Proje | Tur | Neyi olcuyor | Bu proje icin anlami |
| --- | --- | --- | --- |
| `TheAgentCompany` | Benchmark | Simule bir yazilim sirketinde gercek is benzeri gorevler | "AI ofis" vizyonunun zaten benchmark dunyasinda var oldugunu gosteriyor |
| `SWE-bench Verified` | Benchmark | Gercek issue cozum kabiliyeti | Engineer agent kalitesi icin temel gostergelerden biri |
| `Terminal-Bench` | Benchmark | Terminal ustunden agent gorev tamamlama | Coding/system/workflow ajanlari icin kritik |
| `LiveCodeBench` | Benchmark | Contamination-free code degerlendirmesi | Kod kabiliyetini daha temiz olcmeye yardim eder |

### 3.3 Ticari / Urunlesmis Yon

Piyasada bu alanda urunlesme oldugu acik:

- Cognition/Devin cizgisi "AI software engineer" urunlestirmesini zorlamis durumda.
- OpenHands bunun acik platform karsiligi olarak konumlaniyor.
- Anthropic, OpenAI ve Google artik dogrudan agent, tool use, tracing, computer use ve uzun-horizon workflow diliyle dokumantasyon yapiyor.

Sonuc:

- "AI ofis" konsepti yeni degil.
- Ama "guvenli, izlenebilir, role-bound, eval-driven AI software office" hala acik alan.

## 4. Arastirmanin En Kritik Bulgulari

### 4.1 Model ve kaynak tarafinda tarih duzeltmeleri gerekiyor

As of `2026-04-02`:

- `GPT-5.4`, OpenAI tarafinda resmi olarak `2026-03-05` tarihinde duyuruldu.
- `Claude Sonnet 4.6`, Anthropic tarafinda `2026-02` itibariyla guncel model ailesinde yer aliyor.
- Google'in mevcut model dokumantasyonunda `Gemini 3 Pro Preview`, "Shut down" olarak isaretlenmis durumda ve yerine `Gemini 3.1 Pro Preview` oneriliyor.
- Google tarafinda su an `Gemini 3.1 Flash-Lite Preview` da mevcut.

Bu ne demek?

- Eski "Gemini 3 Pro" referanslari uretim tasariminda artik gec kalmis durumda.
- Preview model kullanacaksan fallback ve migration plani zorunlu.

### 4.2 En dogru tasarim: tek mega-agent degil, kontrollu delegasyon

En saglam desen su:

`Router -> Coordinator -> Specialist -> Reviewer -> Human Gate`

Bu yapinin avantaji:

- Her rolun sorumlulugu ayrilir.
- Maliyet routing ile dusurulur.
- Ayni modelin kendi kendini denetlemesi yerine capraz-model review yapilabilir.
- Audit ve root-cause analizi kolaylasir.

### 4.3 En buyuk risk teknik degil, operasyoneldir

Bu sinif sistemlerde asil riskler genelde sunlardir:

- Yanlis gorevi yanlis ajana gondermek
- Tools'a serbest yazma yetkisi vermek
- Prompt'lari versiyonlamamak
- Evaluation olmadan "iyi gorunuyor" diye production'a cikmak
- Browser/computer-use ajanina fazla ayricalik tanimak
- Preview modellere kritik yol baglamak
- Memory'yi sinirsiz buyutmek

## 5. Bu Proje Icin En Dogru Yontemler

Burada "hangi framework daha havali?" sorusu degil, "hangi yapi 6 ay sonra dagilmaz?" sorusu onemli.

Not: Bu bolumdeki framework secimi, sistem bilesenleri ve rol-model eslestirmeleri resmi kaynaklar + benzer projeler uzerinden yaptigim teknik sentezdir. Bunlar birebir tek bir kaynagin tavsiyesi degil, benim uygulama onerimdir.

### 5.1 Birincil omurga onerim: LangGraph tabanli orkestrasyon

Neden:

- Dusuk seviye ve esnek.
- Human-in-the-loop, memory ve state mantigi dogrudan destekleniyor.
- Tek vendor'a kisitlamiyor.
- Uretim icin kontrol ve gorunurluk avantajli.

Bu proje icin en mantikli kullanim:

- Agent runtime = `LangGraph`
- Model katmani = OpenAI + Anthropic + Google adapterlari
- Tracing = OpenTelemetry benzeri izleme + secilen platform
- Memory = sadece gereken yerde, katmanli ve scoped

### 5.2 OpenAI-first bir alternatif: OpenAI Agents SDK

Ne zaman mantikli:

- OpenAI ekosistemine yakin kalmak istiyorsan
- Handoff + tracing + tool use'i hizli toplamak istiyorsan
- Kod-first bir orkestrasyon istiyorsan

Ne zaman sinirli kalabilir:

- Cok vendorlu ve vendor-nötr bir runtime hedefliyorsan
- Uzun vadede daha fazla framework bagimsizligi istiyorsan

### 5.3 CrewAI nereye oturur?

En iyi kullanim:

- Hizli prototip
- Rol bazli sunum / demo
- Akis mantigi daha net ve kuralli use-case'ler

Dikkat edilmesi gereken yer:

- Buyuk olcekli ve cok dinamik sistemlerde kontrol kaybi yasayabilirsin.
- "Crew" metaforu kolay baslar, ama karmasek akislarda state, fallback, retries ve policy tarafini cok net kurmak gerekir.

### 5.4 MetaGPT'yi nasil okumak gerekir?

MetaGPT bence "nihai production base" degil, su iki sey icin cok degerli:

- Rol ayrimi icin referans
- "AI software company" konseptinin urun/mimari ilhami

Ama kendi platformunu kurarken MetaGPT'yi daha cok "urun fikri ve gorev siniflandirma ilhami" olarak okumak daha dogru.

### 5.5 OpenHands nereye oturur?

OpenHands, bu proje icinde su rollerde cok relevant:

- Engineer agent execution
- Headless coding workflows
- GitHub issue -> patch -> validation hatti
- Evaluation / sandboxed execution

Yani "AI ofis"in tamamini OpenHands ile kurmak yerine, "yazilim iscisi" katmani olarak konumlamak daha mantikli.

## 6. Onerilen Agent Yapisi

Baslangic icin 6-8 ajanlik cekirdek yapi en mantikli seviye.

### 6.1 Onerilen cekirdek roller

1. `Router / Dispatcher`
2. `Chief of Staff / Coordinator`
3. `Research Analyst`
4. `Product Manager`
5. `Architect`
6. `Engineer`
7. `QA / Reviewer`
8. `Documentation / Knowledge Agent`

### 6.2 Rol bazli model stratejisi

Asagidaki oneriler `2026-04-02` tarihli arastirma sentezidir:

| Rol | Onerilen model | Not |
| --- | --- | --- |
| Router | `Gemini 3.1 Flash-Lite Preview` | Cok hizli ve dusuk maliyetli routing icin uygun; preview oldugu icin fallback gerekir |
| Router fallback | `Gemini 2.5 Flash-Lite` | Daha stabil, daha uretim dostu dusuk maliyet katmani |
| Coordinator | `GPT-5.4` | Planlama, tool ekosistemi ve agentic workflow icin guclu |
| Research | `Gemini 3.1 Pro Preview` veya `Claude Sonnet 4.6` | Kaynak sentezi ve uzun baglam icin iyi |
| PM | `Gemini 3.1 Pro Preview` | Problem tanimi ve kapsam netlestirme icin uygun |
| Architect | `GPT-5.4` | Sistem dusuncesi ve uzun-horizon task execution icin guclu |
| Engineer | `GPT-5.4` | Coding + agentic workflow kabiliyeti yuksek |
| Reviewer | `Claude Sonnet 4.6` | Capraz model denetimi icin ideal |
| Docs | `Claude Sonnet 4.6` | Yapisal, okunakli teknik yazi ve knowledge outputs icin iyi |
| Browser / UI Ops | `GPT-5.4` veya `Claude Sonnet 4.6` | Sadece sandbox + human gate ile |

Onemli not:

- Preview modeller kritik yolun tek noktasi olmamali.
- Uretim sisteminde her preview model icin stable fallback bulunmali.

## 7. Mimari Oneri

## 7.1 Sistem bilesenleri

| Katman | Oneri | Neden |
| --- | --- | --- |
| API / Control Plane | `FastAPI` benzeri bir backend | Agent run baslatma, policy, auth, audit |
| Orchestration Runtime | `LangGraph` | State, handoff, HITL, kontrollu akis |
| Tool Gateway | Typed tool registry + JSON schema | Tool secimi ve guvenlik siniri |
| Execution Sandbox | Docker tabanli code/browser isci ortami | Ayricalik sinirlamasi |
| Browser Automation | Playwright sinifi bir katman | Deterministik browser test ve task execution |
| State Store | Postgres | Run state, approvals, audit trail |
| Queue / Async Jobs | Is kuyrugu | Uzun task'lar, retries, scheduling |
| Artifact Store | S3/MinIO sinifi | Dosya, rapor, ekran goruntusu, patch artefaktlari |
| Memory Layer | Scoped memory, role bazli | Her seyi ezberleyen tek bellek yerine kontrollu hafiza |
| Observability | Tracing + eval dashboard | Production hata ayiklama ve kalite takibi |

### 7.2 Tool kategorileri

Tool'lari bastan uc sinifa ayirmak gerekir:

- `read tools`: repo oku, belge oku, search, DB query
- `write tools`: dosya yaz, PR ac, issue guncelle, mesaj gonder
- `high-risk tools`: prod deploy, payment, admin panel, account action

Kural:

- High-risk tools daima insan kapisindan gecer.
- Write tools schema-bound olur.
- Read tools en genis izin katmani olur.

### 7.3 Memory stratejisi

Yanlis yontem:

- Tum konusmalari ve task'lari tek memory havuzuna yigma

Dogru yontem:

- `session memory`
- `task memory`
- `project memory`
- `policy memory`

Her katman scope ve TTL ile yonetilmeli.

## 8. Uretimde Denenmesi Gereken Yontemler

### 8.1 Eval-driven development

Bu proje benchmark sevme degil, kendi benchmark'ini kurma isidir.

Ilk gunden sunlari kur:

- 25-50 adet gercek is gorevi
- Altin cikti / kabul kriteri
- Basari, maliyet, sure, insan duzeltmesi metriği
- Regression set

Onerilen eval kategorileri:

- Routing accuracy
- Task completion rate
- Reviewer catch rate
- Unsafe action rate
- Cost per completed task
- Human override rate

### 8.2 Human-in-the-loop by default

Insan kapisi zorunlu alanlar:

- Production deploy
- Finance / invoicing / payment
- Legal / contract
- Security sign-off
- Browser'da anlamli state degisikligi
- Dis sistemlerde yazma islemleri

### 8.3 Cross-model review

Tek model kendi isini review etmemeli.

Dogru desen:

- Ureten model farkli
- Reviewer model farkli aileden
- Cok yuksek riskte insan reviewer da eklenir

### 8.4 Structured outputs + typed tools

Her agent icin final output ya da tool-call yapisi schema'li olmali.

Neden:

- UI / backend entegrasyonu kolaylasir
- Hallucination alani daralir
- Retry/fallback mantigi sade olur

### 8.5 Sandbox-first computer use

Anthropic ve benzeri kaynaklarin da net onerisi bu yonde:

- Ayrı VM/container
- Minimal privilege
- Domain allowlist
- Hassas hesaplari acmama
- Prompt injection'a karsi izolasyon

Bu alan "gosteri" icin degil, ancak kontrol mekanizmasi ile kullanilmali.

### 8.6 Long-running stateful workflows

Bu proje chat uygulamasi gibi dusunulmemeli.

Gerekenler:

- Resume edilebilir run'lar
- Retry policy
- Timeout policy
- Approval pause/resume
- Artifact attachment
- Session basinda re-verification

## 9. Kesinlikle Yapilmamasi Gerekenler

- Ilk gunden 12-15 ajanlik yapi kurmak
- Tum rolleri ayni prompt icine gommek
- Preview modeli fallback'siz kritik yola koymak
- Reviewer olmadan issue kapatmak
- Browser agent'a prod veya finans paneli acmak
- "Benchmark'ta iyi, demek ki production'da da iyi" varsayimi
- Bütün kurumsal hafizayi tek bir vector store'a yikmak
- Prompt versiyonlamasi yapmamak
- Tool izinlerini agent bazinda ayirmamak

## 10. En Saglam Baslangic Kapsami

Bu projeyi once "genel AI ofis" degil, "AI software office" olarak daraltmani oneriyorum.

MVP kapsaminda sadece su workflow'u cikar:

1. Kullanici issue / hedef girer
2. Router siniflandirir
3. Research/PM baglam cikarir
4. Architect cozum onerir
5. Engineer patch hazirlar
6. QA test ve regression senaryosu uretir
7. Reviewer capraz kontrol yapar
8. Human gate onaylarsa merge/deploy hazir olur
9. Docs ajan changelog / ADR / ozet cikarir

Bu akisin avantaji:

- Kodla olculur
- Cikti net
- E2E deger kolay gorulur
- Benchmark'larla kismen hizalanir

## 11. Asamali A'dan Z'ye Kurulum Plani

### Faz 0 - Problem ve policy tasarimi

Sure: 3-5 gun

Teslimatlar:

- Rol matrisi
- Risk matrisi
- Tool envanteri
- Approval matrix
- Eval task seti
- Prompt contracts

### Faz 1 - Tek repo MVP

Sure: 1-2 hafta

Teslimatlar:

- Orchestration runtime
- 6-8 core agent
- Typed tool registry
- Repo read/write sandbox
- Trace ve run kaydi
- Basit operator paneli

### Faz 2 - Gercek workflow entegrasyonu

Sure: 2-4 hafta

Teslimatlar:

- GitHub/Jira/Linear/Docs entegrasyonlari
- Artifact store
- Review ve approval adimlari
- Eval dashboard
- Cost ve latency raporlari

### Faz 3 - Production hardening

Sure: 2-4 hafta

Teslimatlar:

- RBAC
- Multi-project support
- Retry/resume
- Policy engine
- Memory governance
- Fallback models
- Incident / audit exports

## 12. Basari Metrikleri

Bu sistem "zeka" ile degil, operasyon metriği ile yonetilmeli.

Ilk 90 gun icin onerilen KPI'lar:

- Tamamlanan gorev orani
- Insan tarafindan yeniden islenen gorev orani
- Reviewer'in yakaladigi kritik hata orani
- Ortalama gorev tamamlama suresi
- Gorev basi toplam token maliyeti
- Yanlis route orani
- Human escalation orani
- Unsafe action / blocked action sayisi

## 13. Nihai Hukum

Bu proje yapilir.

Ama dogru tez su:

- Bu "AI personel sirketi" degil.
- Bu "guvenli ve olculebilir dijital is gucu platformu"dur.

Pazarda benzerleri var:

- Framework olarak var
- Coding-agent olarak var
- Benchmark olarak var

Fark yaratabilecegin alan ise su:

- Gercek rol sinirlari
- Domain-specific workflows
- Human gate tasarimi
- Eval ve audit disiplini
- Multi-model, cross-review, cost-aware routing

En dogru baslangic karari:

- `AI software office` ile basla
- `LangGraph` sinifi kontrollu runtime kur
- `GPT-5.4 + Claude Sonnet 4.6 + Gemini 3.1 Flash-Lite/Pro` karmasini rol bazli kullan
- preview modellere fallback ekle
- evaluation ve trace'i ilk gunden kur

## 14. Benim Net Onerim

Eger bu projeyi simdi baslatacak olsam:

1. Once `AI software office` scope'unu kilitlerim.
2. Runtime olarak `LangGraph` secip vendor-neutral kalirim.
3. Ilk versiyonda 8 ajani gecmem.
4. `Engineer -> Reviewer -> Human Gate` zincirini zorunlu yaparim.
5. Browser/computer-use capability'yi ancak sandbox ve allowlist ile acarim.
6. Her release'i ic eval seti ile olcerim.

Bu noktadan sonra artik arastirma asamasi yeterince net. Bir sonraki mantikli adim, bu raporu repo iskeleti ve ilk agent runtime'ina cevirmektir.

## 15. Sources

- Artificial Analysis methodology: https://artificialanalysis.ai/methodology/intelligence-benchmarking
- OpenAI GPT-5.4 announcement: https://openai.com/index/introducing-gpt-5-4/
- OpenAI practical guide to building agents: https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/
- OpenAI Agents SDK docs: https://developers.openai.com/api/docs/guides/agents-sdk
- OpenAI Agents SDK tracing docs: https://openai.github.io/openai-agents-python/tracing/
- Google Gemini models overview: https://ai.google.dev/gemini-api/docs/models
- Google Gemini 3.1 Pro Preview: https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview
- Google Gemini 3.1 Flash-Lite Preview: https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite-preview
- Google prompt design strategies: https://ai.google.dev/guide/prompt_best_practices
- Google function calling: https://ai.google.dev/gemini-api/docs/function-calling
- Google structured outputs: https://ai.google.dev/gemini-api/docs/structured-output
- Anthropic Claude Sonnet 4.6: https://www.anthropic.com/claude/sonnet
- Anthropic prompting best practices: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- Anthropic computer use tool: https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool
- LangGraph docs: https://langchain-ai.github.io/langgraphjs/reference/modules/langgraph.html
- LangMem docs: https://langchain-ai.github.io/langmem/
- CrewAI docs: https://docs.crewai.com/
- CrewAI Flows docs: https://docs.crewai.com/en/concepts/flows
- AutoGen Teams docs: https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/teams.html
- MetaGPT repo: https://github.com/FoundationAgents/MetaGPT
- OpenHands: https://openhands.dev/
- TheAgentCompany repo: https://github.com/TheAgentCompany/TheAgentCompany
- SWE-bench Verified: https://www.swebench.com/verified.html
- Terminal-Bench: https://www.tbench.ai/
- LiveCodeBench: https://livecodebench.github.io/
