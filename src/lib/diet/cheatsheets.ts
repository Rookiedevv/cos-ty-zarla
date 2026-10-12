import type { FoodFocus, Method } from "../engine/types";

/**
 * Diet cheatsheets (SPEC §6). General guidance for healthy adults, not medical advice.
 * `key` points are the short version shown on Today after the check-in.
 */
export interface Cheatsheet {
  summary: string;
  how: string[];
  focus: string[];
  avoid: string[];
  tips: string[];
  key: string[];
}

type Lang = "en" | "pl";
type Sheets<K extends string> = Record<K, Record<Lang, Cheatsheet>>;

export const METHOD_SHEETS: Sheets<Method> = {
  none: {
    pl: {
      summary: "Jesz o dowolnych porach. Liczy się tylko dzienny bilans kalorii.",
      how: ["Cel kalorii na dziś jest jedyną zasadą.", "Rozkład posiłków dopasuj do siebie: 3 większe albo 4–5 mniejszych."],
      focus: ["Regularne pory posiłków, żeby nie dopadał Cię wilczy głód", "Białko w każdym posiłku", "Ostatni posiłek 2–3 h przed snem"],
      avoid: ["Podjadanie „przy okazji” między posiłkami", "Jedzenie przed ekranem, bez patrzenia, ile znika"],
      tips: ["Loguj posiłek od razu, póki pamiętasz porcję.", "Zaplanuj kolację tak, by zmieściła się w pozostałych kaloriach."],
      key: ["Jedyna zasada: zmieść się w dziennym celu", "Białko w każdym posiłku", "Bez podjadania między posiłkami"],
    },
    en: {
      summary: "Eat whenever suits you. Only the daily calorie total counts.",
      how: ["Today's calorie target is the only rule.", "Split meals the way that works for you: 3 bigger or 4–5 smaller."],
      focus: ["Regular meal times, so hunger doesn't ambush you", "Protein in every meal", "Last meal 2–3 h before bed"],
      avoid: ["Grazing between meals", "Eating in front of a screen without noticing how much"],
      tips: ["Log a meal right away, while you still remember the portion.", "Plan dinner so it fits the calories you have left."],
      key: ["One rule: stay within today's target", "Protein in every meal", "No grazing between meals"],
    },
  },
  if: {
    pl: {
      summary: "Jesz tylko w dziennym oknie (np. 8 godzin), resztę doby pościsz. Mniej okazji do jedzenia = łatwiej o deficyt.",
      how: [
        "Okno żywieniowe ustawiasz w Ustawienia → Dieta (np. 12:00–20:00).",
        "W czasie postu pijesz tylko napoje bez kalorii.",
        "Kalorie nadal się liczą: okno pomaga, ale nie zastępuje celu.",
      ],
      focus: [
        "Woda, kawa i herbata bez cukru i mleka w czasie postu",
        "Pierwszy posiłek bogaty w białko i warzywa, nie słodki",
        "Duży, sycący posiłek bliżej końca okna",
        "Sól/elektrolity, jeśli w poście boli głowa",
      ],
      avoid: [
        "Mleko, śmietanka, cukier, soki i alkohol w czasie postu (przerywają post)",
        "Objadanie się na start okna „bo wolno”",
        "Podjadanie po zamknięciu okna",
      ],
      tips: [
        "Pierwsze 1–2 tygodnie bywają trudne; głód przychodzi falami i mija w 15–20 min.",
        "Jeśli zjesz poza oknem, zaloguj to normalnie; jutro okno wraca jak zwykle.",
        "Przy treningu rano zaplanuj okno tak, by zjeść białko po wysiłku.",
      ],
      key: ["W poście: tylko woda, czarna kawa, herbata", "Otwórz okno białkiem i warzywami", "Po zamknięciu okna nic nie jesz"],
    },
    en: {
      summary: "You eat only within a daily window (e.g. 8 hours) and fast the rest. Fewer chances to eat make a deficit easier.",
      how: [
        "Set your window in Settings → Diet (e.g. 12:00–20:00).",
        "While fasting, drink only zero-calorie drinks.",
        "Calories still count: the window helps, it doesn't replace the target.",
      ],
      focus: [
        "Water, coffee and tea without sugar or milk while fasting",
        "A first meal rich in protein and vegetables, not sweet",
        "A big, filling meal closer to the end of the window",
        "Salt/electrolytes if you get headaches while fasting",
      ],
      avoid: [
        "Milk, cream, sugar, juice and alcohol while fasting (they break the fast)",
        "Binging when the window opens just because you can",
        "Snacking after the window closes",
      ],
      tips: [
        "The first 1–2 weeks can be hard; hunger comes in waves and passes in 15–20 min.",
        "If you eat outside the window, log it as usual; tomorrow's window stays the same.",
        "If you train in the morning, plan the window so you get protein after exercise.",
      ],
      key: ["While fasting: water, black coffee, tea only", "Open the window with protein and vegetables", "Nothing after the window closes"],
    },
  },
  five_two: {
    pl: {
      summary: "Przez 5 dni jesz normalnie (z umiarkowanym deficytem), w 2 wybrane dni ok. 500–600 kcal.",
      how: [
        "Dni niskokaloryczne wybierasz w Ustawienia → Dieta (najlepiej nie dzień po dniu).",
        "W dni niskie cel to stałe 500 kcal (kobiety) lub 600 kcal (mężczyźni).",
        "W pozostałe dni nie „odrabiasz” zaległości.",
      ],
      focus: [
        "W dni niskie: białko i warzywa (jajka, chude mięso, twaróg, zupy warzywne)",
        "Dużo wody i napojów bez kalorii",
        "Zaplanowane posiłki na dni niskie, zanim zrobisz się głodny",
      ],
      avoid: ["Ciężki trening w dni niskokaloryczne", "Alkohol i słodycze w dni niskie", "Nadrabianie kalorii dzień po dniu niskim"],
      tips: [
        "Najłatwiej w dni pracy, kiedy jesteś zajęty.",
        "2 posiłki po ~300 kcal zwykle sycą lepiej niż 3 małe.",
        "Źle się czujesz? Zjedz normalnie i przesuń dzień niski.",
      ],
      key: ["Dni niskie: białko i warzywa", "Nie nadrabiaj kalorii następnego dnia", "Lekki ruch zamiast treningu w dni niskie"],
    },
    en: {
      summary: "Eat normally (with a moderate deficit) 5 days a week, and about 500–600 kcal on 2 chosen days.",
      how: [
        "Pick the low days in Settings → Diet (ideally not back to back).",
        "On low days the target is a fixed 500 kcal (women) or 600 kcal (men).",
        "On other days you don't make up for them.",
      ],
      focus: [
        "On low days: protein and vegetables (eggs, lean meat, cottage cheese, vegetable soups)",
        "Plenty of water and zero-calorie drinks",
        "Low-day meals planned before you get hungry",
      ],
      avoid: ["Hard training on low days", "Alcohol and sweets on low days", "Eating extra the day after a low day"],
      tips: [
        "Low days are easiest on busy workdays.",
        "Two meals of ~300 kcal usually fill you up better than three small ones.",
        "Feeling unwell? Eat normally and move the low day.",
      ],
      key: ["Low days: protein and vegetables", "Don't make up calories the next day", "Light movement instead of training on low days"],
    },
  },
  montignac: {
    pl: {
      summary: "Wybierasz produkty o niskim indeksie glikemicznym (IG), żeby cukier we krwi rósł powoli i głód wracał później.",
      how: [
        "Węglowodany: tylko z niskim IG (≤ 50), np. pełne ziarno, strączki, większość warzyw.",
        "Tłuszczów nie łączysz z węglowodanami o wysokim IG.",
        "Kalorie nadal się liczą.",
      ],
      focus: [
        "Pieczywo pełnoziarniste, płatki owsiane górskie, kasza gryczana, makaron al dente z pełnego ziarna",
        "Strączki: soczewica, ciecierzyca, fasola",
        "Warzywa, jabłka, gruszki, jagody",
        "Ryby, jaja, chude mięso, oliwa",
      ],
      avoid: [
        "Cukier, słodycze, słodzone napoje i soki",
        "Białe pieczywo, biały ryż, ziemniaki (zwłaszcza puree i frytki)",
        "Kukurydza, płatki śniadaniowe, piwo",
        "Słodkie z tłustym (np. ciasto z kremem)",
      ],
      tips: [
        "Makaron gotowany al dente ma niższy IG niż rozgotowany.",
        "Ostudzone ziemniaki i ryż mają niższy IG niż prosto z garnka.",
        "Dodaj białko i warzywa do każdego posiłku z węglowodanami.",
      ],
      key: ["Węglowodany tylko o niskim IG", "Bez cukru, białej mąki i ziemniaków", "Makaron al dente, pieczywo pełnoziarniste"],
    },
    en: {
      summary: "You choose low glycemic index (GI) foods so blood sugar rises slowly and hunger comes back later.",
      how: [
        "Carbs: only low-GI ones (≤ 50), e.g. whole grains, legumes, most vegetables.",
        "Don't combine fats with high-GI carbs.",
        "Calories still count.",
      ],
      focus: [
        "Wholegrain bread, rolled oats, buckwheat, wholegrain pasta al dente",
        "Legumes: lentils, chickpeas, beans",
        "Vegetables, apples, pears, berries",
        "Fish, eggs, lean meat, olive oil",
      ],
      avoid: [
        "Sugar, sweets, sweetened drinks and juice",
        "White bread, white rice, potatoes (especially mash and fries)",
        "Corn, breakfast cereals, beer",
        "Sweet combined with fatty (e.g. cream cake)",
      ],
      tips: [
        "Pasta cooked al dente has a lower GI than overcooked.",
        "Cooled potatoes and rice have a lower GI than straight from the pot.",
        "Add protein and vegetables to every carb meal.",
      ],
      key: ["Only low-GI carbs", "No sugar, white flour or potatoes", "Pasta al dente, wholegrain bread"],
    },
  },
};

export const FOCUS_SHEETS: Sheets<FoodFocus> = {
  balanced: {
    pl: {
      summary: "Bez zakazów. Jesz wszystko, ale tak, by się najeść w ramach kalorii.",
      how: ["Połowa talerza warzywa, ćwiartka białko, ćwiartka węglowodany.", "Słodycze i alkohol mieszczą się, jeśli zmieszczą się w celu."],
      focus: ["Warzywa i owoce w każdym posiłku", "Białko: mięso, ryby, jaja, nabiał, strączki", "Pełne ziarno zamiast białej mąki", "Woda zamiast słodzonych napojów"],
      avoid: ["Słodzone napoje i soki (dużo kalorii, mało sytości)", "Fast food i przekąski z paczki na co dzień", "Dokładki „bo zostało”"],
      tips: ["Sycące = dużo objętości, mało kalorii: zupy, sałatki, warzywa.", "Jeden słodycz dziennie jest OK, jeśli jest zalogowany."],
      key: ["Pół talerza warzyw", "Białko w każdym posiłku", "Woda zamiast słodkich napojów"],
    },
    en: {
      summary: "No bans. Eat anything, but in a way that keeps you full within your calories.",
      how: ["Half a plate of vegetables, a quarter protein, a quarter carbs.", "Sweets and alcohol fit if they fit the target."],
      focus: ["Vegetables and fruit in every meal", "Protein: meat, fish, eggs, dairy, legumes", "Whole grains instead of white flour", "Water instead of sweet drinks"],
      avoid: ["Sweet drinks and juice (many calories, little fullness)", "Everyday fast food and packaged snacks", "Second helpings because there's some left"],
      tips: ["Filling = high volume, low calories: soups, salads, vegetables.", "One treat a day is fine if you log it."],
      key: ["Half the plate vegetables", "Protein in every meal", "Water instead of sweet drinks"],
    },
  },
  low_carb: {
    pl: {
      summary: "Mało węglowodanów (zwykle < 50–100 g dziennie, na keto < 20–30 g), więcej białka i tłuszczu.",
      how: ["Węglowodany głównie z warzyw nieskrobiowych.", "Pierwsze dni mogą przynieść zmęczenie (tzw. grypa keto): pij wodę i dosalaj."],
      focus: ["Mięso, ryby, jaja, sery, twaróg", "Warzywa liściaste, brokuły, kalafior, cukinia, papryka", "Awokado, oliwa, orzechy (z umiarem: są kaloryczne)", "Jogurt naturalny, skyr"],
      avoid: ["Pieczywo, makaron, ryż, kasze, ziemniaki", "Cukier, słodycze, owoce w dużych ilościach", "Piwo i słodkie alkohole", "Produkty „light” z dodatkiem cukru"],
      tips: ["Tłuszcz jest kaloryczny: low-carb nie znaczy „bez limitu”.", "Kanapkę zastąp sałatką albo jajecznicą.", "Na imprezie: wódka/wino wytrawne zamiast piwa, i licz kalorie."],
      key: ["Bez pieczywa, makaronu, ziemniaków i cukru", "Białko + warzywa w każdym posiłku", "Uważaj na tłuszcz: jest kaloryczny"],
    },
    en: {
      summary: "Few carbs (usually < 50–100 g a day, keto < 20–30 g), more protein and fat.",
      how: ["Carbs mostly from non-starchy vegetables.", "The first days may bring tiredness ('keto flu'): drink water and salt your food."],
      focus: ["Meat, fish, eggs, cheese, cottage cheese", "Leafy greens, broccoli, cauliflower, courgette, peppers", "Avocado, olive oil, nuts (in moderation: they're calorie-dense)", "Plain yogurt, skyr"],
      avoid: ["Bread, pasta, rice, grains, potatoes", "Sugar, sweets, lots of fruit", "Beer and sweet alcoholic drinks", "'Light' products with added sugar"],
      tips: ["Fat is calorie-dense: low-carb doesn't mean unlimited.", "Swap a sandwich for a salad or scrambled eggs.", "At a party: vodka/dry wine instead of beer, and count it."],
      key: ["No bread, pasta, potatoes or sugar", "Protein + vegetables in every meal", "Watch the fat: it's calorie-dense"],
    },
  },
  mediterranean: {
    pl: {
      summary: "Ryby, oliwa, warzywa, strączki i pełne ziarno; mało przetworzonej żywności. Jedna z najlepiej przebadanych diet.",
      how: ["Oliwa jako główny tłuszcz.", "Ryby 2–3 razy w tygodniu, czerwone mięso rzadko."],
      focus: ["Warzywa i owoce, dużo i kolorowo", "Ryby (śledź, makrela, łosoś, sardynki), owoce morza", "Strączki, orzechy, nasiona", "Pełne ziarno, oliwa, jogurt naturalny"],
      avoid: ["Wędliny i przetworzone mięso", "Fast food, słodycze, słodzone napoje", "Białe pieczywo i gotowe dania", "Masło i smalec jako główny tłuszcz"],
      tips: ["Oliwa jest zdrowa, ale ma 90 kcal na łyżkę: odmierzaj.", "Śledź i makrela z puszki to tania polska wersja tej diety."],
      key: ["Ryby 2–3× w tygodniu", "Oliwa zamiast masła (odmierzana)", "Bez wędlin i gotowych dań"],
    },
    en: {
      summary: "Fish, olive oil, vegetables, legumes and whole grains; little processed food. One of the best-studied diets.",
      how: ["Olive oil as the main fat.", "Fish 2–3 times a week, red meat rarely."],
      focus: ["Lots of colourful vegetables and fruit", "Fish (herring, mackerel, salmon, sardines), seafood", "Legumes, nuts, seeds", "Whole grains, olive oil, plain yogurt"],
      avoid: ["Cold cuts and processed meat", "Fast food, sweets, sweet drinks", "White bread and ready meals", "Butter and lard as the main fat"],
      tips: ["Olive oil is healthy but 90 kcal per spoon: measure it.", "Canned herring and mackerel are a cheap Polish take on this diet."],
      key: ["Fish 2–3× a week", "Olive oil instead of butter (measured)", "No cold cuts or ready meals"],
    },
  },
  high_protein: {
    pl: {
      summary: "Dużo białka (cel w aplikacji: 1,6 g na kg masy ciała), żeby chronić mięśnie przy redukcji i dłużej być sytym.",
      how: ["Dzienny cel białka widzisz na ekranie Dziś.", "Rozłóż białko na 3–4 posiłki, po 25–40 g."],
      focus: ["Chude mięso: pierś z kurczaka lub indyka, wołowina", "Ryby, jaja, twaróg, skyr, serek wiejski", "Strączki, tofu", "Odżywka białkowa, jeśli brakuje do celu"],
      avoid: ["Posiłki z samych węglowodanów (np. sama bułka, sam makaron)", "Tłuste mięsa i wędliny jako główne źródło białka (dużo kalorii)", "Batony „proteinowe” pełne cukru"],
      tips: ["Najłatwiej dobić cel: skyr lub twaróg na śniadanie.", "Przy wysokim białku pij więcej wody.", "Trening siłowy + białko = mniej utraty mięśni."],
      key: ["Białko w każdym posiłku (25–40 g)", "Chude źródła: drób, ryby, twaróg, skyr", "Sprawdzaj licznik białka na Dziś"],
    },
    en: {
      summary: "Lots of protein (target in the app: 1.6 g per kg of body weight) to protect muscle while losing fat and stay full longer.",
      how: ["You see your daily protein target on Today.", "Spread protein over 3–4 meals, 25–40 g each."],
      focus: ["Lean meat: chicken or turkey breast, beef", "Fish, eggs, cottage cheese, skyr", "Legumes, tofu", "Protein powder if you're short of the target"],
      avoid: ["Carb-only meals (e.g. just a roll, just pasta)", "Fatty meats and cold cuts as the main protein (many calories)", "Sugary 'protein' bars"],
      tips: ["Easiest way to reach it: skyr or cottage cheese for breakfast.", "Drink more water on high protein.", "Strength training + protein = less muscle loss."],
      key: ["Protein in every meal (25–40 g)", "Lean sources: poultry, fish, cottage cheese, skyr", "Check the protein counter on Today"],
    },
  },
  vegetarian: {
    pl: {
      summary: "Bez mięsa i ryb. Jaja i nabiał zostają.",
      how: ["Białko z nabiału, jaj, strączków i tofu.", "Pilnuj białka: bez mięsa łatwo zjeść same węglowodany."],
      focus: ["Jaja, twaróg, skyr, sery", "Soczewica, ciecierzyca, fasola, tofu, tempeh", "Warzywa, pełne ziarno, orzechy", "Produkty z żelazem + witamina C (np. papryka) do posiłku"],
      avoid: ["Mięso, wędliny, ryby, owoce morza", "Opieranie posiłków na pieczywie i makaronie", "Gotowe „wege” dania z dużą ilością tłuszczu"],
      tips: ["Strączki + zboże (np. soczewica z ryżem) dają pełne białko.", "Rozważ badanie B12 i żelaza raz w roku."],
      key: ["Białko z jaj, nabiału i strączków", "Nie tylko pieczywo i makaron", "Dużo warzyw"],
    },
    en: {
      summary: "No meat or fish. Eggs and dairy stay.",
      how: ["Protein from dairy, eggs, legumes and tofu.", "Watch protein: without meat it's easy to eat mostly carbs."],
      focus: ["Eggs, cottage cheese, skyr, cheese", "Lentils, chickpeas, beans, tofu, tempeh", "Vegetables, whole grains, nuts", "Iron-rich foods with vitamin C (e.g. peppers) in the same meal"],
      avoid: ["Meat, cold cuts, fish, seafood", "Building meals around bread and pasta", "Ready-made veggie meals full of fat"],
      tips: ["Legumes + grains (e.g. lentils with rice) give complete protein.", "Consider checking B12 and iron once a year."],
      key: ["Protein from eggs, dairy and legumes", "Not just bread and pasta", "Lots of vegetables"],
    },
  },
};

export const methodSheet = (m: Method, lang: Lang) => METHOD_SHEETS[m][lang];
export const focusSheet = (f: FoodFocus, lang: Lang) => FOCUS_SHEETS[f][lang];

/** The 3–4 points shown on Today: the method's essentials first, then the food focus. */
export function keyPoints(method: Method, focus: FoodFocus, lang: Lang): string[] {
  const m = method === "none" ? [] : methodSheet(method, lang).key.slice(0, 2);
  const f = focusSheet(focus, lang).key.slice(0, method === "none" ? 3 : 2);
  return [...m, ...f];
}
