/* Respuestas simuladas de la wiki, Wikipedia y Commons para probar sin internet. */
const svgAuto = (color) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 220"><rect width="400" height="220" fill="#d9dcdf"/><path d="M40 160 L80 110 L170 90 L260 92 L320 120 L370 150 L370 170 L40 170Z" fill="${color}"/><circle cx="110" cy="172" r="26" fill="#222"/><circle cx="300" cy="172" r="26" fill="#222"/></svg>`;

const WIKITEXTO_R34 = `{{casting
|name = Nissan Skyline GT-R (BNR34)
|series = [[2010 New Models]]
|years = [[2010]] - Present
|designer = [[Phil Riehlman]]
|number = R0922
|image = R34Sketch.png}}

==Description==
The '''Nissan Skyline GT-R''' is a series of sports cars. This casting is based on a Nissan Skyline GT-R R-Tune.<ref>x</ref>

The base of the casting reads '''Nissan Skyline GT-R R34'''; later versions changed.

==Versions==
{| class="wikitable sortable"
! style="x" |'''Col #'''
! style="x" |'''Year'''
! style="x" |'''Series'''
! style="x" |'''Color'''
! style="x" |'''Tampo'''
! style="x" |'''Photo'''
|-
|007/240
|[[List of 2010 Hot Wheels|2010]]
|[[2010 New Models]]<br>7/44
| rowspan="2" |Metalflake Grey
| rowspan="2" |Nissan logo
| rowspan="2" |[[File:R34 Gray.JPG|75px]]
|-
|007/214
|2010
|[[2010 HW Premiere]]
|-
|112/250
|[[List of 2014 Hot Wheels|2014]]
|[[HW Workshop]]
|Blue
|<script>alert(1)</script> GT-R
|[[File:R34 Blue.JPG|75px]]
|-
|050/250
|2019
|[[HW Speed Graphics]]
|White
|Red stripes
|[[File:R34 White.jpg|75px]]
|}

==Gallery==
<gallery>
R34 Loose.jpg|Loose
</gallery>
`;

const WIKITEXTO_TWIN = `{{casting
|name = Twin Mill
|series = [[1969 Hot Wheels]]
|years = 1969 - Present
|designer = [[Ira Gilford]]
|image = TwinMill.jpg}}

==Description==
The '''Twin Mill''' is an original Hot Wheels design with two engines.

==Versions==
{| class="wikitable"
! Year !! Series !! Color !! Photo
|-
| 1969 || Original 16 || Red || [[File:TM Red.jpg|75px]]
|-
| 2000 || Virtual Collection || Purple || [[File:TM Purple.jpg|75px]]
|}
`;

const INFOBOX = `{{Infobox automobile
| name = Nissan Skyline GT-R
| manufacturer = [[Nissan]]
| production = 1969–1972 · 1989–2002
| layout = [[Front-engine, four-wheel-drive layout|Front-engine, all-wheel-drive]]
| engine = 2.6 L [[Nissan RB engine#RB26DETT|RB26DETT]] twin-turbo [[Straight-six engine|I6]]
| power = {{convert|206|kW|hp|abbr=on}}
| transmission = 6-speed [[Getrag]] manual
| body_style = 2-door [[coupé]]
}}`;

async function simular(route) {
  const url = new URL(route.request().url());
  const p = Object.fromEntries(url.searchParams);
  const json = (obj) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(obj) });
  if (/static\.wikia|upload\.wikimedia/.test(url.hostname)) {
    const colores = ['#c0392b', '#2e6bd1', '#e8e8e8', '#6b6f76', '#f1c40f', '#7d3c98'];
    const c = colores[[...url.pathname].reduce((s, ch) => s + ch.charCodeAt(0), 0) % colores.length];
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svgAuto(c) });
  }
  if (url.hostname === 'hotwheels.fandom.com') {
    const cat = [{ title: 'Category:1:64' }];
    if (p.generator === 'search') return json({ query: { pages: [
      { title: 'Nissan Skyline GT-R (BNR34)', index: 1, categories: cat, thumbnail: { source: 'https://static.wikia.nocookie.net/hotwheels/images/r34.png' } },
      { title: '2010 New Models', index: 2, categories: cat },
      { title: 'Twin Mill', index: 3, categories: cat, thumbnail: { source: 'https://static.wikia.nocookie.net/hotwheels/images/tm.png' } },
      { title: 'AutoZone', index: 4, thumbnail: { source: 'https://static.wikia.nocookie.net/hotwheels/images/az.png' } },
      { title: "'67 Camaro", index: 5, categories: cat, thumbnail: { source: 'https://static.wikia.nocookie.net/hotwheels/images/camaro.png' } },
    ] } });
    if (p.action === 'parse') {
      const w = /Twin/.test(p.page) ? WIKITEXTO_TWIN : /Camaro/.test(p.page) ? WIKITEXTO_R34.replace(/Nissan Skyline GT-R \(BNR34\)/g, "'67 Camaro") : WIKITEXTO_R34;
      return json({ parse: { title: p.page, wikitext: w } });
    }
    if (p.prop === 'categories') return json({ query: { pages: [{ title: p.titles, categories: /Twin/.test(p.titles)
      ? [{ title: 'Category:Unlicensed Hot Wheels' }, { title: 'Category:Hot Wheels Original Designs' }]
      : [{ title: 'Category:Licensed Hot Wheels' }, { title: 'Category:Nissan Cars' }] }] } });
    if (p.prop === 'imageinfo') return json({ query: { pages: p.titles.split('|').map((t) => ({ title: t, imageinfo: [{ thumburl: 'https://static.wikia.nocookie.net/hotwheels/images/' + encodeURIComponent(t) }] })) } });
  }
  if (/wikipedia\.org$/.test(url.hostname)) {
    /* Búsqueda de respaldo cuando la Hot Wheels Wiki no responde (solo artículos con ficha de auto). */
    if (p.generator === 'search' && /hastemplate:"Infobox automobile"/.test(p.gsrsearch || '')) return json({ query: { pages: [
      { title: 'Nissan Skyline GT-R', index: 1, thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/x/r34.jpg' } },
      { title: 'Nissan Skyline', index: 2 },
    ] } });
    if (url.pathname.includes('/page/summary/')) return json({ title: 'Nissan Skyline GT-R', extract: 'El Nissan Skyline GT-R es un deportivo japonés de Nissan.', type: 'standard' });
    if (p.list === 'search') return json({ query: { search: [{ title: 'Nissan Skyline GT-R' }, { title: 'Nissan RB engine' }, { title: 'Nissan Skyline' }] } });
    if (p.prop === 'imageinfo' && p.titles) {
      const n = p.titles.replace(/^File:/, '');
      return json({ query: { pages: [{ title: p.titles, imageinfo: [{ width: 1600, height: 900, url: 'https://upload.wikimedia.org/wikipedia/commons/x/' + encodeURIComponent(n), thumburl: 'https://upload.wikimedia.org/wikipedia/commons/x/' + encodeURIComponent(n), descriptionurl: 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(n), extmetadata: { Artist: { value: '<a href="x">Fotógrafo <b>Ejemplo</b></a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' } } }] }] } });
    }
    if (p.prop === 'langlinks') return json({ query: { pages: [{ title: p.titles, langlinks: [{ lang: 'es', title: 'Nissan Skyline GT-R' }] }] } });
    if (p.generator === 'images') {
      const nombres = ['Nissan Skyline R34 GT-R Nür front left.jpg', 'Nissan Skyline R34 GT-R Nür rear right.jpg', 'Nissan Skyline R33 GT-R 001.jpg', 'RB26DETT R34 engine.jpg'];
      return json({ query: { pages: nombres.map((n) => ({ title: 'File:' + n, imageinfo: [{ width: 1600, height: 900, thumburl: 'https://upload.wikimedia.org/wikipedia/commons/x/' + encodeURIComponent(n), descriptionurl: 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(n), extmetadata: { Artist: { value: '<a href="x">Fotógrafo <b>Ejemplo</b></a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] })) } });
    }
    if (String(p.prop || '').includes('revisions')) return json({ query: { pages: [
      { title: 'Nissan Skyline GT-R', original: { source: 'https://upload.wikimedia.org/wikipedia/commons/x/Nissan_Skyline_GT-R_R34_V_Spec_II.jpg' }, revisions: [{ slots: { main: { content: INFOBOX } } }] },
      { title: 'Nissan Skyline', revisions: [{ slots: { main: { content: '{{Infobox automobile\n| production = 1957–present\n}}' } } }] },
    ] } });
  }
  if (url.hostname === 'commons.wikimedia.org') {
    const nombres = ['Nissan Skyline R34 GT-R V Spec side.jpg', 'Nissan Skyline R34 police car.jpg', 'Nissan Skyline R34 at show.jpg'];
    return json({ query: { pages: nombres.map((n, i) => ({ title: 'File:' + n, index: i + 1, imageinfo: [{ width: 1600, height: 900, thumburl: 'https://upload.wikimedia.org/wikipedia/commons/x/' + encodeURIComponent(n), descriptionurl: 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(n), extmetadata: { Artist: { value: 'Otra persona' }, LicenseShortName: { value: 'CC BY 2.0' } } }] })) } });
  }
  return route.fulfill({ status: 404, body: '' });
}

module.exports = { simular };
