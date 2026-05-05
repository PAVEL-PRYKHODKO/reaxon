/**
 * Дефолты контента макета delivery.html v2 (dv2-*).
 * Подмешиваются в deliveryUkraine[lang].pageV2 на сервере и в админке.
 */

const WIDE_RU = {
  visible: true,
  title: "Запорожье и Запорожская область",
  sub: "Собственная служба доставки",
  priceFromLabel: "от",
  priceFrom: "300 грн",
  priceToLabel: "до",
  priceTo: "1000+ грн",
  ctaLabel: "Рассчитать доставку",
  ctaHref: "https://novaposhta.ua/shipping-cost/",
  imageUrl: "assets/delivery-zaporizhzhia-card.png",
  imageAlt:
    "Доставка лакокрасочной продукции Reaxon в Запорожье и Запорожскую область",
};

const SIDE_RU = {
  visible: true,
  title: "По Украине",
  sub: "Транспортные компании",
  note:
    "Срок обычно 1–7 дней в зависимости от направления. Стоимость — по тарифам «Новой Почты», «Укрпочты» или другого перевозчика.",
};

const FAQ_RU = {
  visible: true,
  title: "Часто задаваемые вопросы",
  items: [
    {
      q: "Как оформить доставку?",
      body: "Добавьте товары в корзину и отправьте заявку или позвоните менеджеру. Мы подтвердим состав заказа, вес и доступные варианты отправки.",
    },
    {
      q: "Можно ли оплатить при получении?",
      body: "Возможна предоплата на счёт или карту, а также наличные / терминал при самовывозе или по согласованию с курьерской службой в вашем городе.",
    },
    {
      q: "Как упаковываются ЛКМ?",
      body: "Тара фиксируется для перевозки. При получении проверьте целостность. При повреждении оформляйте акт у перевозчика и свяжитесь с нами в день доставки.",
    },
  ],
};

const ROW_LOCAL_RU = {
  visible: true,
  imageUrl: "assets/delivery-row-zaporizhzhia.png",
  imageAlt: "Доставка Reaxon по Запорожью и области — брендированный фургон",
  title: "Запорожье и Запорожская область",
  pill1: "Заказ до 5000 грн",
  pill2: "Срок: 1–2 дня",
  priceFromLabel: "от",
  priceToLabel: "до",
  priceLead: "Стоимость от ",
  priceFrom: "300 грн",
  priceMid: " до ",
  priceTo: "1000+ грн",
  priceTrail: "",
  ctaLabel: "Заказать доставку",
  ctaHref: "contact.html#contact",
  aside1Title: "Срок",
  aside1Text:
    "Сборка заказа — от 1 рабочего дня после подтверждения. Курьер по Запорожью, области и пригороду — по согласованному интервалу.",
  aside2Title: "Как считаем",
  aside2List:
    "расстояние и вес отправления;\nсрочность (стандарт / экспресс);\nподъём и разгрузка — по запросу.",
};

const ROW_NAT_RU = {
  visible: true,
  imageUrl: "assets/delivery-ukraine-row.png",
  imageAlt: "Доставка продукции Reaxon по Украине — фура с логотипом на трассе",
  title: "По Украине",
  pill1: "Отделение или адрес",
  pill2: "Срок: 2–7 дней",
  priceLead: "Отправка от ",
  priceFrom: "1000 грн",
  priceMid: "",
  priceTo: "",
  priceTrail: " (ориентир по тарифам ТК)",
  ctaLabel: "Уточнить по направлению",
  ctaHref: "contact.html#contact",
  aside1Title: "Срок",
  aside1Text:
    "После передачи груза перевозчику — по графику компании. В крупные города чаще 1–3 дня до отделения.",
  aside2Title: "Перевозчики",
  aside2List:
    "«Новая Почта» — отделение, почтомат, адрес;\n«Укрпочта» — для небольших посылок;\nопт и паллеты — отдельный расчёт.",
};

const ROW_PICKUP_RU = {
  visible: true,
  imageUrl: "assets/delivery-row-pickup.png",
  imageAlt: "Самовывоз со склада Reaxon — фургон у логистического центра",
  title: "Самовывоз",
  addressText:
    "Наш склад: г. Запорожье, ул. Константина Великого, 20\nТел.: +38 (067) 613-42-20, 067 613-51-55\nreaxondh@gmail.com",
  ctaLabel: "Согласовать время визита",
  ctaHref: "contact.html#contact",
  asideTitle: "Важно",
  asideText:
    "Выдача только после подтверждения готовности заказа менеджером. Возьмите с собой документ, удостоверяющий личность (для юрлиц — доверенность).",
};

function pack(lang, wide, side, faq, local, nat, pickup) {
  return {
    wideCard: { ...wide },
    sideCard: { ...side },
    faq: {
      visible: faq.visible,
      title: faq.title,
      items: faq.items.map((x) => ({ q: x.q, body: x.body })),
    },
    rows: {
      local: { ...local },
      national: { ...nat },
      pickup: { ...pickup },
    },
  };
}

export const DEFAULT_DELIVERY_PAGE_V2 = {
  ru: pack("ru", WIDE_RU, SIDE_RU, FAQ_RU, ROW_LOCAL_RU, ROW_NAT_RU, ROW_PICKUP_RU),
  uk: pack(
    "uk",
    {
      ...WIDE_RU,
      title: "Запоріжжя та Запорізька область",
      sub: "Власна служба доставки",
      priceFromLabel: "від",
      priceToLabel: "до",
      ctaLabel: "Розрахувати доставку",
    },
    {
      ...SIDE_RU,
      title: "По Україні",
      sub: "Транспортні компанії",
      note:
        "Термін зазвичай 1–7 днів залежно від напрямку. Вартість — за тарифами «Нової Пошти», «Укрпошти» або іншого перевізника.",
    },
    {
      ...FAQ_RU,
      title: "Часті запитання",
      items: [
        {
          q: "Як оформити доставку?",
          body: "Додайте товари в кошик і надішліть заявку або зателефонуйте менеджеру. Ми підтвердимо склад замовлення, вагу та доступні варіанти відправлення.",
        },
        {
          q: "Чи можна оплатити при отриманні?",
          body: "Можлива передоплата на рахунок або картку, а також готівка / термінал при самовивозі або за погодженням з кур’єрською службою у вашому місті.",
        },
        {
          q: "Як пакують ЛКМ?",
          body: "Тара фіксується для перевезення. При отриманні перевірте цілісність. У разі пошкодження оформлюйте акт у перевізника і зв’яжіться з нами в день доставки.",
        },
      ],
    },
    {
      ...ROW_LOCAL_RU,
      title: "Запоріжжя та Запорізька область",
      pill1: "Замовлення до 5000 грн",
      pill2: "Термін: 1–2 дні",
      priceFromLabel: "від",
      priceToLabel: "до",
      priceLead: "Вартість від ",
      ctaLabel: "Замовити доставку",
      aside1Title: "Термін",
      aside1Text:
        "Комплектація замовлення — від 1 робочого дня після підтвердження. Кур’єр по Запоріжжю, області та передмістю — за погодженим інтервалом.",
      aside2Title: "Як рахуємо",
    },
    {
      ...ROW_NAT_RU,
      title: "По Україні",
      pill1: "Відділення або адреса",
      pill2: "Термін: 2–7 днів",
      priceLead: "Відправлення від ",
      priceTrail: " (орієнтир за тарифами ТК)",
      ctaLabel: "Уточнити за напрямком",
      aside1Title: "Термін",
      aside1Text:
        "Після передачі вантажу перевізнику — за графіком компанії. У великі міста частіше 1–3 дні до відділення.",
      aside2Title: "Перевізники",
      aside2List:
        "«Нова Пошта» — відділення, поштомат, адреса;\n«Укрпошта» — для невеликих посилок;\nопт і палети — окремий розрахунок.",
    },
    {
      ...ROW_PICKUP_RU,
      title: "Самовивіз",
      addressText:
        "Наш склад: м. Запоріжжя, вул. Костянтина Великого, 20\nТел.: +38 (067) 613-42-20, 067 613-51-55\nreaxondh@gmail.com",
      ctaLabel: "Погодити час візиту",
      asideTitle: "Важливо",
      asideText:
        "Видача лише після підтвердження готовності замовлення менеджером. Візьміть документ, що посвідчує особу (для юросіб — довіреність).",
    }
  ),
  en: pack(
    "en",
    {
      ...WIDE_RU,
      title: "Zaporizhzhia and Zaporizhzhia Oblast",
      sub: "In-house delivery",
      priceFromLabel: "from",
      priceToLabel: "to",
      ctaLabel: "Estimate shipping",
      imageAlt: "Reaxon coatings delivery in Zaporizhzhia and the oblast",
    },
    {
      ...SIDE_RU,
      title: "Across Ukraine",
      sub: "Carriers",
      note:
        "Transit is usually 1–7 days depending on destination. Cost follows Nova Poshta, Ukrposhta or other carrier tariffs.",
    },
    {
      ...FAQ_RU,
      title: "FAQ",
      items: [
        {
          q: "How do I arrange delivery?",
          body: "Add items to the cart and submit a request or call a manager. We will confirm the order, weight and shipping options.",
        },
        {
          q: "Can I pay on delivery?",
          body: "Prepayment to account or card is possible, as well as cash / terminal on pickup or as agreed with the courier in your city.",
        },
        {
          q: "How are coatings packed?",
          body: "Drums and cans are secured for transit. On receipt check for damage; file a carrier report and contact us the same day if needed.",
        },
      ],
    },
    {
      ...ROW_LOCAL_RU,
      title: "Zaporizhzhia and Zaporizhzhia Oblast",
      pill1: "Orders up to 5,000 UAH",
      pill2: "Lead time: 1–2 days",
      priceFromLabel: "from",
      priceToLabel: "to",
      priceLead: "Cost from ",
      ctaLabel: "Request delivery",
      aside1Title: "Timing",
      aside1Text:
        "Order picking from 1 business day after confirmation. Courier in Zaporizhzhia, the oblast and suburbs — at an agreed time window.",
      aside2Title: "How we quote",
      aside2List:
        "distance and shipment weight;\nstandard vs express urgency;\nlift and unloading — on request.",
    },
    {
      ...ROW_NAT_RU,
      title: "Across Ukraine",
      pill1: "Branch or address",
      pill2: "Transit: 2–7 days",
      priceLead: "Shipping from ",
      priceFrom: "1,000 UAH",
      priceTrail: " (indicative per carrier tariffs)",
      ctaLabel: "Ask for your route",
      aside1Title: "Timing",
      aside1Text:
        "After handover to the carrier — per their schedule. To major cities often 1–3 days to a branch.",
      aside2Title: "Carriers",
      aside2List:
        "Nova Poshta — branch, locker, address;\nUkrposhta — smaller parcels;\nwholesale and pallets — separate quote.",
    },
    {
      ...ROW_PICKUP_RU,
      title: "Pickup",
      addressText:
        "Warehouse: Zaporizhzhia, 20 Konstantyna Velykoho St.\nTel.: +38 (067) 613-42-20, 067 613-51-55\nreaxondh@gmail.com",
      ctaLabel: "Schedule a visit",
      asideTitle: "Please note",
      asideText:
        "Pickup only after a manager confirms the order is ready. Bring ID (for legal entities — a letter of attorney).",
      imageAlt: "Reaxon warehouse pickup — van at the logistics centre",
    }
  ),
};
