// Vercel Serverless Function
// 경로: /api/weather?lat=35.18&lon=129.17
// 역할: Open-Meteo API를 서버 측에서 호출하여 CORS 우회

export default async function handler(req, res) {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    return res.status(400).json({ error: 'lat, lon 파라미터 필요' });
  }

  // 좌표 유효성 검사
  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  if (isNaN(latNum) || isNaN(lonNum) || Math.abs(latNum) > 90 || Math.abs(lonNum) > 180) {
    return res.status(400).json({ error: '잘못된 좌표' });
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latNum}&longitude=${lonNum}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,surface_pressure&timezone=auto`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(response.status).json({
        error: `Open-Meteo HTTP ${response.status}`
      });
    }
    const data = await response.json();

    // 5분 캐시 (Vercel Edge 캐시 활용해서 호출량 줄임)
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({
      error: 'Open-Meteo 호출 실패',
      detail: err.message
    });
  }
}
