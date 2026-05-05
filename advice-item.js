const ADVICE_ARTICLES = {
  "primer-enamel": {
    title: "Как выбрать систему: грунт + эмаль",
    lead: "Грамотная схема окраски обычно включает подготовку основания, грунтовку и финишную эмаль. Это снижает расход и повышает срок службы покрытия.",
    imageKind: "primer-enamel",
    sections: [
      {
        title: "Когда нужна двухслойная система",
        text: "Для металла и наружных работ почти всегда рекомендуется комбинация грунта и эмали: грунт отвечает за адгезию и защиту от коррозии, эмаль — за декоративность и стойкость к внешней среде.",
      },
      {
        title: "Что учитывать при выборе",
        text: "Тип основания, влажность, температура эксплуатации, способ нанесения и требуемый срок службы. Для складов и производственных помещений чаще выбирают более стойкие схемы с нормированным межслойным интервалом.",
      },
    ],
    checklist: ["Очистить основание", "Нанести грунт по технологии", "Выдержать сушку", "Нанести 1-2 слоя эмали"],
  },
  "surface-prep": {
    title: "Подготовка поверхности перед окраской",
    lead: "До 70% проблем с покрытием связаны не с материалом, а с плохой подготовкой основания.",
    imageKind: "surface-prep",
    sections: [
      { title: "Очистка и обезжиривание", text: "Удалите пыль, ржавчину, старые непрочные покрытия и масляные следы." },
      { title: "Контроль состояния", text: "Основание должно быть сухим и однородным. На влажной поверхности адгезия ухудшается." },
    ],
    checklist: ["Механическая очистка", "Обезжиривание", "Сушка основания", "Пробный участок"],
  },
  calc: {
    title: "Как рассчитать расход материалов",
    lead: "Точный расчет помогает избежать простоев и лишних закупок на объекте.",
    imageKind: "calc",
    sections: [
      { title: "Базовая формула", text: "Расход = площадь * норму расхода * количество слоев * коэффициент потерь." },
      { title: "Запас материала", text: "Обычно добавляют 8-15% на потери (геометрия, способ нанесения, ветер, шероховатость)." },
    ],
    checklist: ["Посчитать площадь", "Определить слои", "Добавить потери", "Проверить фасовку"],
  },
  "two-coats": {
    title: "Нанесение в 2 слоя: как не получить перерасход",
    lead: "Два слоя дают лучшую укрывистость, но при нарушении технологии быстро возникает перерасход.",
    imageKind: "two-coats",
    sections: [
      { title: "Первый слой", text: "Наносите тоньше, формируя базовую адгезионную пленку без потеков." },
      { title: "Второй слой", text: "Наносите после межслойной сушки для равномерного цвета и толщины." },
    ],
    checklist: ["Тонкий первый слой", "Сушка между слоями", "Контроль толщины", "Нанесение без переувлажнения"],
  },
  "roller-vs-spray": {
    title: "Когда выбирать валик, а когда распыление",
    lead: "Выбор инструмента напрямую влияет на скорость, расход и качество покрытия.",
    imageKind: "roller-vs-spray",
    sections: [
      { title: "Валик и кисть", text: "Подходят для локального ремонта, небольших площадей и сложных контуров." },
      { title: "Распыление", text: "Лучше для больших однотипных поверхностей и более ровной финишной пленки." },
    ],
    checklist: ["Оценить площадь", "Проверить доступность зон", "Учесть требования к фактуре", "Подобрать оборудование"],
  },
  storage: {
    title: "Как хранить материалы, чтобы не терять свойства",
    lead: "Нарушение условий хранения ухудшает вязкость, укрывистость и стабильность материала.",
    imageKind: "storage",
    sections: [
      { title: "Температура и тара", text: "Храните герметично закрытую тару в сухом помещении, без перегрева и солнца." },
      { title: "Перед работой", text: "Проверьте однородность и вязкость, при необходимости перемешайте по регламенту." },
    ],
    checklist: ["Склад без перегрева", "Закрытая тара", "Маркировка партий", "Проверка перед нанесением"],
  },
  outdoor: {
    title: "Система «грунт + эмаль» для наружных работ",
    lead: "Уличные конструкции испытывают УФ, осадки и перепады температуры, поэтому схема покрытия должна быть стабильной.",
    imageKind: "outdoor",
    sections: [
      { title: "Защитный контур", text: "Грунт защищает основание, эмаль формирует атмосферостойкий внешний слой." },
      { title: "Условия нанесения", text: "Работайте в допустимом диапазоне температуры и влажности, избегайте осадков." },
    ],
    checklist: ["Оценка погоды", "Подготовка основания", "Грунт", "Финишная эмаль"],
  },
  metal: {
    title: "Окраска металла: как избежать коррозии через сезон",
    lead: "Для металла критичны очистка, адгезия и барьерный слой от влаги.",
    imageKind: "metal",
    sections: [
      { title: "Удаление коррозии", text: "Ржавчину и окалину удаляют до стабильного слоя, затем обезжиривают поверхность." },
      { title: "Толщина покрытия", text: "Недостаточная толщина ускоряет коррозию, избыточная — повышает риск отслоения." },
    ],
    checklist: ["Очистка металла", "Антикоррозионный грунт", "Контроль толщины", "Проверка сушки"],
  },
  weather: {
    title: "Температура и влажность: частые ошибки при нанесении",
    lead: "Неподходящие условия воздуха и основания часто приводят к дефектам поверхности.",
    imageKind: "weather",
    sections: [
      { title: "Температура основания", text: "Ориентируйтесь на рекомендации производителя и избегайте перегретого металла." },
      { title: "Влажность и точка росы", text: "При высокой влажности и близкой точке росы увеличивается риск конденсата и плохой адгезии." },
    ],
    checklist: ["Проверить температуру", "Проверить влажность", "Контроль точки росы", "Корректный режим сушки"],
  },
  safety: {
    title: "Безопасность малярных работ на объекте",
    lead: "Безопасность — обязательная часть технологии и качества работ.",
    imageKind: "safety",
    sections: [
      { title: "СИЗ и вентиляция", text: "Используйте респираторы, перчатки и обеспечьте обмен воздуха в рабочей зоне." },
      { title: "Организация работ", text: "Храните материалы по регламенту, исключайте источники возгорания, соблюдайте инструкции." },
    ],
    checklist: ["СИЗ", "Проветривание", "Безопасное хранение", "Инструктаж персонала"],
  },
};

function adviceImg(kind, label) {
  const live = {
    "primer-enamel": "https://images.pexels.com/photos/5691633/pexels-photo-5691633.jpeg?auto=compress&cs=tinysrgb&w=1200",
    "surface-prep": "https://images.pexels.com/photos/6474348/pexels-photo-6474348.jpeg?auto=compress&cs=tinysrgb&w=1200",
    calc: "https://images.pexels.com/photos/669615/pexels-photo-669615.jpeg?auto=compress&cs=tinysrgb&w=1200",
    "two-coats": "https://images.pexels.com/photos/6474471/pexels-photo-6474471.jpeg?auto=compress&cs=tinysrgb&w=1200",
    "roller-vs-spray": "https://images.pexels.com/photos/5799173/pexels-photo-5799173.jpeg?auto=compress&cs=tinysrgb&w=1200",
    storage: "https://images.pexels.com/photos/4483610/pexels-photo-4483610.jpeg?auto=compress&cs=tinysrgb&w=1200",
    outdoor: "https://images.pexels.com/photos/6474478/pexels-photo-6474478.jpeg?auto=compress&cs=tinysrgb&w=1200",
    metal: "https://images.pexels.com/photos/6474475/pexels-photo-6474475.jpeg?auto=compress&cs=tinysrgb&w=1200",
    weather: "https://images.pexels.com/photos/355952/pexels-photo-355952.jpeg?auto=compress&cs=tinysrgb&w=1200",
    safety: "https://images.pexels.com/photos/8853507/pexels-photo-8853507.jpeg?auto=compress&cs=tinysrgb&w=1200",
  };
  return live[kind] || "";
}

function adviceIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id") || "primer-enamel";
}

function renderAdviceArticle() {
  const root = document.getElementById("advice-article-root");
  if (!root) return;
  const id = adviceIdFromUrl();
  const article = ADVICE_ARTICLES[id] || ADVICE_ARTICLES["primer-enamel"];
  const sectionsHtml = article.sections
    .map(
      (s) => `
        <article class="advice-article-card">
          <h3>${s.title}</h3>
          <p>${s.text}</p>
        </article>
      `
    )
    .join("");
  const checklistHtml = article.checklist.map((c) => `<li>${c}</li>`).join("");

  root.innerHTML = `
    <article class="advice-article-card">
      <img class="advice-image advice-hero-image" src="${adviceImg(article.imageKind, article.title)}" alt="${article.title}" />
      <h1 class="product-title">${article.title}</h1>
      <p class="product-meta">${article.lead}</p>
    </article>
    ${sectionsHtml}
    <article class="advice-article-card">
      <h3>Чеклист перед запуском работ</h3>
      <ul class="advice-checklist">${checklistHtml}</ul>
      <div class="hero-cta">
        <a class="btn btn-primary" href="price.html">Открыть прайс</a>
        <a class="btn btn-ghost" href="contact.html#contact">Получить консультацию</a>
      </div>
    </article>
  `;
}

renderAdviceArticle();
