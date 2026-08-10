// 하마필름 알바 계약서 3종 생성 (독일법 기준, 독·한 병기)
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, HeadingLevel, PageBreak,
} = require("docx");

const OUT = process.argv[2] || ".";
const FONT = { ascii: "Calibri", hAnsi: "Calibri", eastAsia: "Malgun Gothic" };

// ---------- helpers ----------
const de = (text, opts = {}) => new Paragraph({
  spacing: { after: opts.tight ? 40 : 60, line: 264 },
  children: [new TextRun({ text, font: FONT, size: 20, bold: !!opts.bold })],
});
const ko = (text, opts = {}) => new Paragraph({
  spacing: { after: opts.last ? 200 : 60, line: 252 },
  children: [new TextRun({ text, font: FONT, size: 18, color: "595959" })],
});
const clause = (deTitle, koTitle) => new Paragraph({
  spacing: { before: 200, after: 80 },
  children: [
    new TextRun({ text: deTitle, font: FONT, size: 21, bold: true }),
    new TextRun({ text: "   " + koTitle, font: FONT, size: 19, bold: true, color: "404040" }),
  ],
});
const title = (deText, koText) => [
  new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 60 },
    children: [new TextRun({ text: deText, font: FONT, size: 30, bold: true })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 240 },
    children: [new TextRun({ text: koText, font: FONT, size: 22, bold: true, color: "404040" })],
  }),
];
const blank = (n = 25) => "_".repeat(n);
const noteP = (deText, koText) => new Paragraph({
  spacing: { before: 60, after: 160 },
  shading: { type: "clear", fill: "F2F2F2" },
  children: [
    new TextRun({ text: "Hinweis: " + deText, font: FONT, size: 17, italics: true, color: "595959" }),
    new TextRun({ break: 1, text: "참고: " + koText, font: FONT, size: 17, italics: true, color: "595959" }),
  ],
});
const footerMuster = () => new Paragraph({
  spacing: { before: 300 },
  border: { top: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" } },
  children: [new TextRun({
    text: "Muster / 양식 — Dieses Dokument ist eine Vorlage und ersetzt keine Rechts- oder Steuerberatung. 본 문서는 참고용 양식이며 법률·세무 자문을 대체하지 않습니다.",
    font: FONT, size: 15, italics: true, color: "808080",
  })],
});

const cell = (text, { w, bold = false, size = 18, fill, align } = {}) => new TableCell({
  width: { size: w, type: WidthType.DXA },
  shading: fill ? { type: "clear", fill } : undefined,
  margins: { top: 60, bottom: 60, left: 80, right: 80 },
  children: [new Paragraph({
    alignment: align || AlignmentType.LEFT,
    children: [new TextRun({ text, font: FONT, size, bold })],
  })],
});

const sigBlock = () => [
  new Paragraph({ spacing: { before: 500 } }),
  new Table({
    width: { size: 9400, type: WidthType.DXA },
    columnWidths: [4400, 600, 4400],
    borders: { top: {style: BorderStyle.NONE}, bottom: {style: BorderStyle.NONE}, left: {style: BorderStyle.NONE}, right: {style: BorderStyle.NONE}, insideHorizontal: {style: BorderStyle.NONE}, insideVertical: {style: BorderStyle.NONE} },
    rows: [
      new TableRow({ children: [
        cell("_______________________________", { w: 4400 }),
        cell("", { w: 600 }),
        cell("_______________________________", { w: 4400 }),
      ]}),
      new TableRow({ children: [
        cell("Ort, Datum, Unterschrift Arbeitgeber", { w: 4400, size: 17 }),
        cell("", { w: 600 }),
        cell("Ort, Datum, Unterschrift Arbeitnehmer/in", { w: 4400, size: 17 }),
      ]}),
      new TableRow({ children: [
        cell("장소, 날짜, 사용자(고용주) 서명", { w: 4400, size: 16 }),
        cell("", { w: 600 }),
        cell("장소, 날짜, 근로자 서명", { w: 4400, size: 16 }),
      ]}),
    ],
  }),
];

const A4_MARGINS = { top: 1000, bottom: 900, left: 1100, right: 1100 };

// ============================================================
// 1) Arbeitsvertrag (Minijob) — 근로계약서
// ============================================================
function buildContract() {
  const children = [
    ...title("Arbeitsvertrag für geringfügig entlohnte Beschäftigte (Minijob)",
             "근로계약서 — 소액근로(미니잡) 단시간 근로자용"),

    de("Zwischen", { bold: true }),
    de(`Firma / Inhaber:in: ${blank(45)}`),
    de(`Anschrift: ${blank(52)}`),
    de("— nachfolgend „Arbeitgeber“ — ", { tight: true }),
    ko("사용자(고용주): 상호/대표자 및 주소를 기재 — 이하 “사용자”"),
    de("und", { bold: true }),
    de(`Name: ${blank(30)}   geboren am: ${blank(14)}`),
    de(`Anschrift: ${blank(52)}`),
    de("— nachfolgend „Arbeitnehmer/in“ — wird folgender Arbeitsvertrag geschlossen:", { tight: true }),
    ko("근로자: 성명·생년월일·주소를 기재 — 이하 “근로자”. 양 당사자는 아래와 같이 근로계약을 체결한다."),

    clause("§ 1 Beginn, Art und Ort der Tätigkeit", "§ 1 계약 개시일·업무 내용·근무 장소"),
    de(`Das Arbeitsverhältnis beginnt am ${blank(14)}. Es ist  ☐ unbefristet   ☐ befristet bis zum ${blank(12)}.`),
    de("Der/Die Arbeitnehmer/in wird als Aushilfskraft im Fotostudio „Hamafilm“ beschäftigt. Die Tätigkeit umfasst insbesondere: Kundenbetreuung, Bedienung und Pflege der Fotoautomaten, Kassenführung und Tagesabschluss, Reinigungs- und Aufräumarbeiten sowie vergleichbare Tätigkeiten."),
    de(`Arbeitsort: ${blank(50)}`),
    ko("근로관계는 위 기재일에 개시되며, 기간의 정함이 없거나(무기) 기재된 날짜까지(기간제)로 한다. 근로자는 포토스튜디오 “하마필름”의 보조 인력으로서 고객 응대, 포토부스 기기 조작·관리, 캐셔(현금 관리) 및 일일 마감, 청소·정리 등 이에 준하는 업무를 수행한다. 근무 장소를 기재한다.", { last: true }),

    clause("§ 2 Probezeit", "§ 2 수습기간"),
    de(`Die ersten ${blank(4)} Monate (höchstens 6) gelten als Probezeit. Während der Probezeit kann das Arbeitsverhältnis beiderseits mit einer Frist von zwei Wochen gekündigt werden (§ 622 Abs. 3 BGB).`),
    ko("최초 기재 개월(최대 6개월)은 수습기간으로 하며, 수습기간 중에는 양 당사자가 2주의 예고기간을 두고 계약을 해지할 수 있다.", { last: true }),

    clause("§ 3 Arbeitszeit", "§ 3 근로시간"),
    de(`Die regelmäßige Arbeitszeit beträgt ${blank(5)} Stunden pro Woche. Die Verteilung der Arbeitszeit richtet sich nach dem Dienstplan des Arbeitgebers, der rechtzeitig — in der Regel mindestens vier Tage im Voraus — mitgeteilt wird.`),
    ko("주당 소정근로시간을 반드시 숫자로 기재한다. 근무시간 배치는 사용자가 작성하는 근무표(스케줄)에 따르며, 원칙적으로 최소 4일 전에 통지한다.", { last: true }),
    noteP("Wird keine wöchentliche Arbeitszeit vereinbart, gilt bei Arbeit auf Abruf nach § 12 TzBfG eine Arbeitszeit von 20 Stunden/Woche als vereinbart — die Wochenstunden daher unbedingt eintragen.",
          "주당 근로시간을 비워두면 독일 단시간근로법(§ 12 TzBfG)상 주 20시간을 합의한 것으로 간주되어 미니잡 한도를 초과할 수 있으니 반드시 기재하세요."),

    clause("§ 4 Vergütung und Auszahlung", "§ 4 임금 및 지급 방법"),
    de(`Der/Die Arbeitnehmer/in erhält einen Stundenlohn von ${blank(7)} € brutto. Der gesetzliche Mindestlohn (Stand 2026: 13,90 €/Std.) wird nicht unterschritten.`),
    de(`Die Vergütung wird monatlich abgerechnet und spätestens zum ${blank(4)}. des Folgemonats ausgezahlt:`),
    de("☐  in bar gegen Unterzeichnung einer Lohnquittung        ☐  durch Überweisung auf folgendes Konto:"),
    de(`IBAN: ${blank(34)}`),
    de("Bei Barauszahlung bestätigt der/die Arbeitnehmer/in den Empfang des Betrags jeweils durch Unterschrift auf der Lohnquittung. Der Arbeitgeber erstellt für jeden Monat eine Lohnabrechnung."),
    de("Die durchschnittliche monatliche Vergütung darf die Geringfügigkeitsgrenze (Stand 2026: 603 €/Monat) nicht überschreiten."),
    ko("시급(세전)을 기재하며 법정 최저임금(2026년 기준 시급 13.90유로) 이상이어야 한다. 임금은 월 단위로 정산하여 익월 기재일까지 지급하고, 지급 방법(현금 지급 시 수령확인서 서명 / 계좌이체)을 체크한다. 현금으로 지급하는 경우 근로자는 매회 급여 수령확인서(Lohnquittung)에 서명하여 수령을 확인하고, 사용자는 매월 급여명세서(Lohnabrechnung)를 발급한다. 월평균 임금은 미니잡 한도(2026년 기준 월 603유로)를 초과할 수 없다.", { last: true }),

    clause("§ 5 Steuern und Sozialversicherung", "§ 5 세금 및 사회보험"),
    de("Der Arbeitgeber meldet die Beschäftigung bei der Minijob-Zentrale an und trägt die Pauschalabgaben. In der gesetzlichen Rentenversicherung besteht Versicherungspflicht mit einem Eigenanteil des Arbeitnehmers/der Arbeitnehmerin (derzeit 3,6 %)."),
    de("☐  Der/Die Arbeitnehmer/in beantragt die Befreiung von der Rentenversicherungspflicht.        ☐  Keine Befreiung."),
    ko("사용자는 이 고용을 미니잡센터(Minijob-Zentrale)에 신고하고 정액 사회보험료·세금을 부담한다. 법정 연금보험은 근로자 본인부담분(현재 3.6%)이 있는 의무가입이며, 근로자는 신청으로 면제받을 수 있다(해당 항목 체크).", { last: true }),

    clause("§ 6 Weitere Beschäftigungen", "§ 6 겸직(다른 일자리)"),
    de(`Der/Die Arbeitnehmer/in erklärt:  ☐ keine weitere Beschäftigung   ☐ folgende weitere Beschäftigung(en): ${blank(24)}`),
    de("Die Aufnahme oder Beendigung weiterer Beschäftigungen ist dem Arbeitgeber unverzüglich mitzuteilen, da mehrere Minijobs zusammengerechnet werden."),
    ko("근로자는 다른 근로관계 유무를 표시하고, 이후 변동이 생기면 지체 없이 사용자에게 알린다. 여러 개의 미니잡은 합산되어 한도를 초과하면 미니잡 자격이 상실되기 때문이다.", { last: true }),

    clause("§ 7 Feiertage", "§ 7 공휴일"),
    de("Für Arbeitszeit, die infolge eines gesetzlichen Feiertags ausfällt, gilt die gesetzliche Regelung (§ 2 EFZG)."),
    ko("근무 예정일이 법정 공휴일이라 근무가 없게 된 경우 법정 규정(§ 2 EFZG)에 따른다.", { last: true }),

    clause("§ 8 Arbeitszeitaufzeichnung", "§ 8 근무시간 기록"),
    de("Beginn, Ende und Dauer der täglichen Arbeitszeit werden gemäß § 17 MiLoG spätestens sieben Tage nach der Arbeitsleistung aufgezeichnet (Dienstplan-/Kassensystem des Arbeitgebers bzw. Stundenzettel). Der/Die Arbeitnehmer/in wirkt an der Aufzeichnung mit und bestätigt sie auf Verlangen durch Unterschrift."),
    ko("독일 최저임금법 § 17에 따라 매일의 근무 시작·종료·시간을 늦어도 7일 이내에 기록해야 한다(사용자의 스케줄/포스 시스템 또는 근무시간 기록표 사용). 근로자는 기록에 협조하고 요청 시 서명으로 확인한다.", { last: true }),

    clause("§ 9 Kassenführung, Verschwiegenheit und Eigentum", "§ 9 현금 관리·비밀유지·비품"),
    de("Der/Die Arbeitnehmer/in behandelt die Kasse mit Sorgfalt, führt den Tagesabschluss nach den Vorgaben des Arbeitgebers durch und meldet Fehlbeträge oder Unregelmäßigkeiten unverzüglich. Über Geschäfts- und Betriebsgeheimnisse (u. a. Umsätze, Kundendaten, Zugangscodes) ist Stillschweigen zu bewahren, auch nach Beendigung des Arbeitsverhältnisses. Überlassene Schlüssel, Zugangscodes und Arbeitsmittel sind bei Beendigung zurückzugeben."),
    ko("근로자는 시재(현금)를 주의 깊게 관리하고 사용자 지침에 따라 일일 마감을 수행하며, 부족액·이상 발견 시 즉시 보고한다. 매출, 고객정보, 출입코드 등 영업비밀은 재직 중은 물론 퇴사 후에도 비밀로 유지한다. 지급받은 열쇠·코드·비품은 계약 종료 시 반납한다.", { last: true }),

    clause("§ 10 Kündigung", "§ 10 계약 해지(해고·사직)"),
    de("Nach Ablauf der Probezeit gelten die gesetzlichen Kündigungsfristen des § 622 BGB (Grundfrist: vier Wochen zum Fünfzehnten oder zum Ende eines Kalendermonats). Jede Kündigung bedarf der Schriftform (§ 623 BGB)."),
    ko("수습기간 이후에는 독일 민법 § 622의 법정 예고기간(기본: 4주 전 통보, 매월 15일 또는 말일자)이 적용된다. 해지는 반드시 서면(자필 서명)으로 해야 하며, 문자·이메일 통보는 효력이 없다.", { last: true }),

    clause("§ 11 Schlussbestimmungen", "§ 11 기타 조항"),
    de("Dieser Vertrag enthält die wesentlichen Arbeitsbedingungen im Sinne des Nachweisgesetzes. Änderungen und Ergänzungen bedürfen der Textform. Sollten einzelne Bestimmungen unwirksam sein, bleibt der Vertrag im Übrigen wirksam; anstelle der unwirksamen Bestimmung gilt die gesetzliche Regelung. Jede Partei erhält ein unterschriebenes Exemplar."),
    ko("이 계약서는 독일 근로조건명시법(Nachweisgesetz)상 필수 기재사항을 포함한다. 계약의 변경·보충은 텍스트 형식(서면·이메일 등)으로 한다. 일부 조항이 무효라도 나머지는 유효하며, 무효 조항은 법정 규정으로 대체된다. 계약서는 2부 작성하여 각자 1부씩 보관한다.", { last: true }),

    ...sigBlock(),
    footerMuster(),
  ];

  return new Document({
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [{ properties: { page: { margin: A4_MARGINS } }, children }],
  });
}

// ============================================================
// 1b) Arbeitsvertrag (kurzfristige Beschäftigung) — 단기고용 계약서
// ============================================================
function buildContractKurzfristig() {
  const children = [
    ...title("Arbeitsvertrag für kurzfristig Beschäftigte",
             "근로계약서 — 단기고용(kurzfristige Beschäftigung)용"),

    de("Zwischen", { bold: true }),
    de(`Firma / Inhaber:in: ${blank(45)}`),
    de(`Anschrift: ${blank(52)}`),
    de("— nachfolgend „Arbeitgeber“ — ", { tight: true }),
    ko("사용자(고용주): 상호/대표자 및 주소를 기재 — 이하 “사용자”"),
    de("und", { bold: true }),
    de(`Name: ${blank(30)}   geboren am: ${blank(14)}`),
    de(`Anschrift: ${blank(52)}`),
    de("— nachfolgend „Arbeitnehmer/in“ — wird folgender Arbeitsvertrag geschlossen:", { tight: true }),
    ko("근로자: 성명·생년월일·주소를 기재 — 이하 “근로자”. 양 당사자는 아래와 같이 근로계약을 체결한다."),

    clause("§ 1 Befristung, Art und Ort der Tätigkeit", "§ 1 계약기간·업무 내용·근무 장소"),
    de(`Das Arbeitsverhältnis beginnt am ${blank(14)} und ist befristet bis zum ${blank(14)} (Laufzeit insgesamt höchstens zwölf Monate).`),
    de(`Die Beschäftigung ist im Voraus auf höchstens ${blank(4)} Arbeitstage (max. 70 Arbeitstage innerhalb der Vertragslaufzeit) begrenzt und wird nur an einzelnen Tagen nach Dienstplan ausgeübt.`),
    de("Der/Die Arbeitnehmer/in wird als Aushilfskraft im Fotostudio „Hamafilm“ beschäftigt. Die Tätigkeit umfasst insbesondere: Kundenbetreuung, Bedienung und Pflege der Fotoautomaten, Kassenführung und Tagesabschluss, Reinigungs- und Aufräumarbeiten sowie vergleichbare Tätigkeiten."),
    de(`Arbeitsort: ${blank(50)}`),
    ko("단기고용은 반드시 기간의 정함이 있어야 한다: 개시일과 종료일을 기재하고(총 기간 최대 12개월), 계약기간 내 최대 근무일수(70일 이내)를 사전에 계약서에 명시한다. 업무 내용은 포토스튜디오 “하마필름”의 고객 응대, 포토부스 기기 조작·관리, 캐셔 및 일일 마감, 청소·정리 등이다.", { last: true }),
    noteP("Eine unbefristete oder dauerhaft wiederkehrende Beschäftigung gilt als regelmäßig und ist NICHT kurzfristig — die Befristung daher unbedingt eintragen. Ein neuer Rahmenvertrag mit derselben Person setzt eine Unterbrechung von mindestens zwei Monaten voraus.",
          "기한 없이 계속 반복되는 형태는 상시고용으로 간주되어 단기고용 자격이 인정되지 않으므로 반드시 종료일을 적으세요. 같은 사람과 다시 단기고용 계약을 맺으려면 최소 2개월의 공백이 필요합니다."),

    clause("§ 2 Arbeitszeit und Dienstplan", "§ 2 근로시간·근무표"),
    de(`Der Einsatz erfolgt an einzelnen Tagen nach Dienstplan, voraussichtlich ca. ${blank(4)} Tage pro Monat mit jeweils ca. ${blank(4)} Stunden. Die Einsatztage werden rechtzeitig — in der Regel mindestens vier Tage im Voraus — abgestimmt.`),
    ko("근무는 근무표에 따라 개별 일자에만 이루어지며, 예상 월 근무일수와 1회 근무시간을 기재한다. 근무일은 원칙적으로 최소 4일 전에 협의·통지한다.", { last: true }),

    clause("§ 3 Vergütung und Auszahlung", "§ 3 임금 및 지급 방법"),
    de(`Der/Die Arbeitnehmer/in erhält einen Stundenlohn von ${blank(7)} € brutto. Der gesetzliche Mindestlohn (Stand 2026: 13,90 €/Std.) wird nicht unterschritten.`),
    de(`Die Vergütung wird monatlich abgerechnet und spätestens zum ${blank(4)}. des Folgemonats ausgezahlt:`),
    de("☐  in bar gegen Unterzeichnung einer Lohnquittung        ☐  durch Überweisung auf folgendes Konto:"),
    de(`IBAN: ${blank(34)}`),
    de("Bei Barauszahlung bestätigt der/die Arbeitnehmer/in den Empfang des Betrags jeweils durch Unterschrift auf der Lohnquittung. Der Arbeitgeber erstellt für jeden Abrechnungsmonat eine Lohnabrechnung."),
    ko("시급(세전)을 기재하며 법정 최저임금(2026년 기준 시급 13.90유로) 이상이어야 한다. 임금은 월 단위 정산하여 익월 기재일까지 지급하고, 현금 지급 시 근로자는 매회 급여 수령확인서에 서명한다. 사용자는 매월 급여명세서를 발급한다. 단기고용은 미니잡과 달리 월 급여 상한이 없다.", { last: true }),

    clause("§ 4 Status des Arbeitnehmers / der Arbeitnehmerin", "§ 4 근로자 신분 확인 (직업성 여부)"),
    de("Der/Die Arbeitnehmer/in erklärt, dass die Beschäftigung nicht berufsmäßig ausgeübt wird. Er/Sie ist:"),
    de(`☐ Schüler/in   ☐ Student/in   ☐ hauptberuflich beschäftigt bei: ${blank(22)}   ☐ Sonstiges: ${blank(14)}`),
    de(`Vorbeschäftigungen: Der/Die Arbeitnehmer/in hat im laufenden Kalenderjahr bereits ${blank(4)} Arbeitstage in anderen kurzfristigen Beschäftigungen gearbeitet. Weitere kurzfristige Beschäftigungen sind dem Arbeitgeber unverzüglich anzuzeigen, da alle Zeiten zusammengerechnet werden.`),
    ko("단기고용은 “생계 목적의 직업”이 아닌 경우에만 가능하다(학생·주부·본업이 있는 사람 등은 가능, 실업자는 불가). 근로자는 해당 신분을 체크하고, 같은 해에 다른 단기고용으로 일한 일수를 기재한다. 모든 단기고용 일수는 합산되어 연 70일을 초과하면 자격이 상실되므로, 변동이 생기면 즉시 사용자에게 알린다.", { last: true }),

    clause("§ 5 Steuern und Sozialversicherung", "§ 5 세금 및 사회보험"),
    de("Die Beschäftigung ist als kurzfristige Beschäftigung sozialversicherungsfrei (keine Beiträge zur Renten-, Kranken-, Pflege- und Arbeitslosenversicherung). Der Arbeitgeber meldet die Beschäftigung bei der Minijob-Zentrale an und trägt die gesetzlichen Umlagen sowie die Unfallversicherung."),
    de(`Die Versteuerung erfolgt:  ☐ individuell nach den elektronischen Lohnsteuerabzugsmerkmalen (ELStAM)   ☐ pauschal mit 25 % (§ 40a EStG) zu Lasten des ${blank(16)}.`),
    ko("단기고용은 사회보험(연금·건강·요양·실업보험료)이 면제된다. 사용자는 미니잡센터에 신고(인원그룹 110)하고 법정 분담금과 산재보험을 부담한다. 세금은 근로자의 개인 세금정보(ELStAM)로 처리하거나(학생은 보통 실질 0%), 정액 25%로 처리할 수 있다(부담 주체 기재).", { last: true }),

    clause("§ 6 Feiertage", "§ 6 공휴일"),
    de("Für Arbeitszeit, die infolge eines gesetzlichen Feiertags ausfällt, gilt die gesetzliche Regelung (§ 2 EFZG)."),
    ko("근무 예정일이 법정 공휴일이어서 근무가 없게 된 경우 법정 규정(§ 2 EFZG)에 따른다.", { last: true }),

    clause("§ 7 Arbeitszeitaufzeichnung", "§ 7 근무시간 기록"),
    de("Beginn, Ende und Dauer der täglichen Arbeitszeit werden gemäß § 17 MiLoG spätestens sieben Tage nach der Arbeitsleistung aufgezeichnet (Dienstplan-/Kassensystem des Arbeitgebers bzw. Stundenzettel). Der/Die Arbeitnehmer/in wirkt an der Aufzeichnung mit und bestätigt sie auf Verlangen durch Unterschrift. Die Einsatztage werden zusätzlich fortlaufend gezählt."),
    ko("최저임금법 § 17에 따라 일별 근무 시작·종료·시간을 7일 이내에 기록한다(스케줄/포스 시스템 또는 근무시간 기록표). 연 70일 한도 관리를 위해 근무일수도 계속 집계한다.", { last: true }),

    clause("§ 8 Kassenführung, Verschwiegenheit und Eigentum", "§ 8 현금 관리·비밀유지·비품"),
    de("Der/Die Arbeitnehmer/in behandelt die Kasse mit Sorgfalt, führt den Tagesabschluss nach den Vorgaben des Arbeitgebers durch und meldet Fehlbeträge oder Unregelmäßigkeiten unverzüglich. Über Geschäfts- und Betriebsgeheimnisse (u. a. Umsätze, Kundendaten, Zugangscodes) ist Stillschweigen zu bewahren, auch nach Beendigung des Arbeitsverhältnisses. Überlassene Schlüssel, Zugangscodes und Arbeitsmittel sind bei Beendigung zurückzugeben."),
    ko("근로자는 시재(현금)를 주의 깊게 관리하고 사용자 지침에 따라 일일 마감을 수행하며, 부족액·이상 발견 시 즉시 보고한다. 매출, 고객정보, 출입코드 등 영업비밀은 퇴사 후에도 비밀로 유지하고, 지급받은 열쇠·코드·비품은 계약 종료 시 반납한다.", { last: true }),

    clause("§ 9 Kündigung", "§ 9 계약 해지"),
    de("Das Arbeitsverhältnis endet mit Ablauf der Befristung, ohne dass es einer Kündigung bedarf. Das Recht zur ordentlichen Kündigung mit den gesetzlichen Fristen (§ 622 BGB) wird beiderseits vorbehalten. Jede Kündigung bedarf der Schriftform (§ 623 BGB)."),
    ko("계약은 기재된 종료일이 지나면 별도 통보 없이 종료된다. 그 전이라도 양 당사자는 독일 민법 § 622의 법정 예고기간을 두고 해지할 수 있으며, 해지는 반드시 서면(자필 서명)으로 한다.", { last: true }),

    clause("§ 10 Schlussbestimmungen", "§ 10 기타 조항"),
    de("Dieser Vertrag enthält die wesentlichen Arbeitsbedingungen im Sinne des Nachweisgesetzes. Änderungen und Ergänzungen bedürfen der Textform. Sollten einzelne Bestimmungen unwirksam sein, bleibt der Vertrag im Übrigen wirksam; anstelle der unwirksamen Bestimmung gilt die gesetzliche Regelung. Jede Partei erhält ein unterschriebenes Exemplar."),
    ko("이 계약서는 독일 근로조건명시법상 필수 기재사항을 포함한다. 변경·보충은 텍스트 형식으로 하며, 일부 조항이 무효라도 나머지는 유효하다. 계약서는 2부 작성하여 각자 1부씩 보관한다.", { last: true }),

    ...sigBlock(),
    footerMuster(),
  ];

  return new Document({
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [{ properties: { page: { margin: A4_MARGINS } }, children }],
  });
}

// ============================================================
// 2) Lohnquittung (현금 수령확인서) + Jahresübersicht (연간 지급대장)
// ============================================================
function receiptBlock(n) {
  const line = (label, koLabel, rest) => new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({ text: label + "  ", font: FONT, size: 20, bold: true }),
      new TextRun({ text: koLabel + "   ", font: FONT, size: 17, color: "595959" }),
      new TextRun({ text: rest, font: FONT, size: 20 }),
    ],
  });
  return [
    new Paragraph({
      spacing: { before: n === 1 ? 0 : 400, after: 40 },
      border: n === 2 ? { top: { style: BorderStyle.DASHED, size: 4, color: "808080" } } : undefined,
      children: [new TextRun({ text: `Quittung Nr. ${blank(6)}`, font: FONT, size: 17, color: "808080" })],
    }),
    new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: "Quittung über Barauszahlung des Arbeitsentgelts", font: FONT, size: 24, bold: true })],
    }),
    new Paragraph({
      spacing: { after: 160 },
      children: [new TextRun({ text: "임금(급여) 현금 수령 확인서", font: FONT, size: 19, bold: true, color: "404040" })],
    }),
    line("Arbeitgeber:", "사용자", `Hamafilm, ${blank(38)}`),
    line("Arbeitnehmer/in:", "근로자", blank(40)),
    line("Abrechnungszeitraum:", "정산 기간(월/연도)", blank(24)),
    line("Geleistete Arbeitsstunden:", "근무시간 합계", `${blank(10)} Std.`),
    line("Ausgezahlter Betrag (netto):", "실지급액", `${blank(12)} €    in Worten / 금액 문자표기: ${blank(24)}`),
    new Paragraph({
      spacing: { before: 60, after: 60 },
      children: [new TextRun({ text: "Hiermit bestätige ich, den oben genannten Betrag heute in bar und vollständig erhalten zu haben.", font: FONT, size: 20 })],
    }),
    new Paragraph({
      spacing: { after: 300 },
      children: [new TextRun({ text: "본인은 위 금액을 오늘 현금으로 전액 수령하였음을 확인합니다.", font: FONT, size: 18, color: "595959" })],
    }),
    new Paragraph({
      spacing: { after: 0 },
      children: [new TextRun({ text: `Ort, Datum: ${blank(22)}        Unterschrift Arbeitnehmer/in / 근로자 서명: ${blank(22)}`, font: FONT, size: 20 })],
    }),
  ];
}

function buildReceipt() {
  const months = ["Januar / 1월","Februar / 2월","März / 3월","April / 4월","Mai / 5월","Juni / 6월",
                  "Juli / 7월","August / 8월","September / 9월","Oktober / 10월","November / 11월","Dezember / 12월"];
  const W = [1900, 1500, 1700, 1900, 2400];
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell("Monat / 월", { w: W[0], bold: true, fill: "E8E8E8" }),
      cell("Stunden / 시간", { w: W[1], bold: true, fill: "E8E8E8" }),
      cell("Betrag € / 금액", { w: W[2], bold: true, fill: "E8E8E8" }),
      cell("Zahldatum / 지급일", { w: W[3], bold: true, fill: "E8E8E8" }),
      cell("Unterschrift / 근로자 서명", { w: W[4], bold: true, fill: "E8E8E8" }),
    ],
  });
  const rows = months.map(m => new TableRow({
    children: [cell(m, { w: W[0] }), cell("", { w: W[1] }), cell("", { w: W[2] }), cell("", { w: W[3] }), cell("", { w: W[4] })],
  }));

  const children = [
    ...receiptBlock(1),
    ...receiptBlock(2),
    new Paragraph({ children: [new PageBreak()] }),
    ...title("Jahresübersicht der Lohnzahlungen", "연간 급여 지급 대장"),
    de(`Jahr: ${blank(8)}     Arbeitnehmer/in / 근로자: ${blank(30)}     Arbeitgeber / 사용자: Hamafilm`),
    new Paragraph({ spacing: { after: 120 } }),
    new Table({ width: { size: 9400, type: WidthType.DXA }, columnWidths: W, rows: [header, ...rows] }),
    new Paragraph({ spacing: { before: 200 }, children: [new TextRun({
      text: "Jede Barauszahlung wird zusätzlich durch eine Einzelquittung bestätigt. / 매회 현금 지급 시 개별 수령확인서도 함께 작성합니다. 지급 기록과 수령확인서는 최소 2년 이상 보관하세요.",
      font: FONT, size: 17, italics: true, color: "595959" })] }),
    footerMuster(),
  ];

  return new Document({
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [{ properties: { page: { margin: A4_MARGINS } }, children }],
  });
}

// ============================================================
// 3) Stundenzettel (월별 근무시간 기록표)
// ============================================================
function buildTimesheet() {
  const W = [900, 1500, 1500, 1400, 1700, 2400];
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell("Datum / 날짜", { w: W[0], bold: true, size: 16, fill: "E8E8E8" }),
      cell("Beginn / 시작", { w: W[1], bold: true, size: 16, fill: "E8E8E8" }),
      cell("Ende / 종료", { w: W[2], bold: true, size: 16, fill: "E8E8E8" }),
      cell("Pause (Min.) / 휴게", { w: W[3], bold: true, size: 16, fill: "E8E8E8" }),
      cell("Arbeitszeit (Std.) / 근무시간", { w: W[4], bold: true, size: 16, fill: "E8E8E8" }),
      cell("Bemerkung / 비고", { w: W[5], bold: true, size: 16, fill: "E8E8E8" }),
    ],
  });
  const rows = Array.from({ length: 31 }, (_, i) => new TableRow({
    children: W.map((w, c) => cell(c === 0 ? String(i + 1) + "." : "", { w, size: 16, align: c === 0 ? AlignmentType.CENTER : undefined })),
  }));
  const sumLabel = new TableCell({
    width: { size: W[0] + W[1] + W[2] + W[3], type: WidthType.DXA },
    columnSpan: 4,
    shading: { type: "clear", fill: "F2F2F2" },
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Summe / 합계", font: FONT, size: 16, bold: true })] })],
  });
  const sum = new TableRow({
    children: [sumLabel, cell("", { w: W[4], fill: "F2F2F2" }), cell("", { w: W[5], fill: "F2F2F2" })],
  });

  const children = [
    ...title("Stundenzettel / Arbeitszeitnachweis", "월별 근무시간 기록표"),
    de(`Monat/Jahr: ${blank(12)}     Arbeitnehmer/in / 근로자: ${blank(28)}     Arbeitgeber / 사용자: Hamafilm`),
    new Paragraph({ spacing: { after: 100 } }),
    new Table({ width: { size: 9400, type: WidthType.DXA }, columnWidths: W, rows: [header, ...rows, sum] }),
    new Paragraph({ spacing: { before: 160 }, children: [new TextRun({
      text: "Gemäß § 17 MiLoG sind Beginn, Ende und Dauer der täglichen Arbeitszeit spätestens 7 Tage nach der Arbeitsleistung aufzuzeichnen und mindestens 2 Jahre aufzubewahren. / 독일 최저임금법 § 17에 따라 일별 근무 시작·종료·시간을 7일 이내에 기록하고 최소 2년간 보관해야 합니다.",
      font: FONT, size: 16, italics: true, color: "595959" })] }),
    new Paragraph({ spacing: { before: 300 }, children: [new TextRun({
      text: `Unterschrift Arbeitnehmer/in / 근로자 서명: ${blank(20)}          Unterschrift Arbeitgeber / 사용자 서명: ${blank(20)}`,
      font: FONT, size: 18 })] }),
    footerMuster(),
  ];

  return new Document({
    styles: { default: { document: { run: { font: FONT, size: 18 } } } },
    sections: [{ properties: { page: { margin: { top: 800, bottom: 700, left: 1100, right: 1100 } } }, children }],
  });
}

// ---------- write ----------
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const jobs = [
    ["Arbeitsvertrag_Minijob_하마필름.docx", buildContract()],
    ["Arbeitsvertrag_Kurzfristig_하마필름.docx", buildContractKurzfristig()],
    ["Lohnquittung_급여현금수령확인서.docx", buildReceipt()],
    ["Stundenzettel_근무시간기록표.docx", buildTimesheet()],
  ];
  for (const [name, doc] of jobs) {
    const buf = await Packer.toBuffer(doc);
    fs.writeFileSync(path.join(OUT, name), buf);
    console.log("wrote", name, buf.length, "bytes");
  }
})();
