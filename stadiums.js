/* Metres. Sources and reconstruction assumptions: docs/stadiums.md. */
(function (root) {
  'use strict';
  // The club's overhead guide shows two straight side walls and a flat centre
  // cut-off, rather than a pointed centre joining arbitrary 22.5-degree anchors.
  // Derive the corners from the published foul-line and centre distances.
  function clippedSquareBoundary(side, center) {
    const x = Math.SQRT2 * side - center;
    const angle = Math.atan2(x, center) * 180 / Math.PI;
    const cornerDistance = Math.hypot(x, center);
    return [[-45, side], [-angle, cornerDistance], [angle, cornerDistance], [45, side]];
  }
  const stadiums = [
    { id: 'jamsil', name: '잠실야구장', left: 100, center: 125, right: 100, fenceHeight: 2.6 },
    { id: 'gocheok', name: '고척스카이돔', left: 99, center: 122, right: 99, fenceHeight: 4 },
    { id: 'incheon', name: '인천 SSG 랜더스필드', left: 95, center: 120, right: 95, fenceHeight: 2.8 },
    { id: 'suwon', name: '수원 KT 위즈파크', left: 98, center: 120, right: 98, fenceHeight: 4 },
    { id: 'daejeon', name: '대전 한화생명 볼파크', left: 99, center: 122, right: 95, fenceHeight: 2.4,
      boundary: [[-45,99],[-22.5,115],[0,122],[22.5,112],[45,95]], rightWallHeight: 8 },
    // Height reports conflict (3.2 vs 3.6m); 3.2 is provisional, not verified.
    { id: 'daegu', name: '대구 삼성 라이온즈파크', left: 99.5, center: 122.5, right: 99.5, fenceHeight: 3.2,
      boundary: clippedSquareBoundary(99.5, 122.5) },
    { id: 'gwangju', name: '광주 기아 챔피언스필드', left: 99, center: 121, right: 99, fenceHeight: 2.6 },
    { id: 'sajik', name: '부산 사직야구장', left: 95.8, center: 120.5, right: 95.8, fenceHeight: 4.8 },
    // NC's published field markings; +/-22.5-degree gap directions are schematic.
    { id: 'changwon', name: '창원 NC파크', left: 101, center: 122, right: 101, fenceHeight: 3.3,
      boundary: [[-45,101],[-22.5,123],[0,122],[22.5,123],[45,101]] }
  ];
  for (const stadium of stadiums) {
    if (stadium.boundary) {
      stadium.boundary.forEach(Object.freeze);
      Object.freeze(stadium.boundary);
    }
    Object.freeze(stadium);
  }
  root.KBOStadiums = Object.freeze(stadiums);
})(typeof window === 'undefined' ? globalThis : window);
