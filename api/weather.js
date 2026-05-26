// Vercel Serverless Function
// 경로: /api/weather?lat=35.18&lon=129.17
// 역할: OpenWeatherMap API를 서버 측에서 호출해서 응답을 Open-Meteo 포맷으로 변환
// 환경변수: OPENWEATHER_API_KEY (Vercel Settings → Environment Variables)

export default async function handler(req, res) {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    return res.status(400).json({ error: 'lat, lon 파라미터 필요' });
  }

  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  if (isNaN(latNum) || isNaN(lonNum) || Math.abs(latNum) > 90 || Math.abs(lonNum) > 180) {
    return res.status(400).json({ error: '잘못된 좌표' });
  }

  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENWEATHER_API_KEY 환경변수 미설정' });
  }

  // OpenWeatherMap Current Weather API (무료 플랜)
  // units=metric: 섭씨 / 풍속 m/s
  // lang=kr: 한국어 설명
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${latNum}&lon=${lonNum}&appid=${apiKey}&units=metric&lang=kr`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: `OpenWeatherMap HTTP ${response.status}`,
        detail: errBody.message || ''
      });
    }
    const data = await response.json();

    // OpenWeatherMap → Open-Meteo 포맷으로 변환
    // 클라이언트 기존 코드가 c.temperature_2m, c.weather_code 등을 참조하므로
    const owmCode = data.weather?.[0]?.id;
    const transformed = {
      current: {
        temperature_2m: data.main?.temp,
        relative_humidity_2m: data.main?.humidity,
        apparent_temperature: data.main?.feels_like,
        weather_code: mapOwmToWmo(owmCode),  // OpenWeatherMap → WMO 코드 변환
        wind_speed_10m: data.wind?.speed != null ? data.wind.speed * 3.6 : null, // m/s → km/h
        surface_pressure: data.main?.pressure // hPa
      },
      _raw: {
        owm_id: owmCode,
        owm_main: data.weather?.[0]?.main,
        owm_desc: data.weather?.[0]?.description
      }
    };

    // 1분 캐시 (Vercel Edge에서 호출량 줄임, OpenWeatherMap 데이터도 10분 단위 갱신이므로 충분)
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(transformed);
  } catch (err) {
    return res.status(500).json({
      error: 'OpenWeatherMap 호출 실패',
      detail: err.message
    });
  }
}

// OpenWeatherMap weather id → WMO weather code 매핑
// 클라이언트의 weatherIcons 객체가 WMO 코드 기반이라 변환 필요
// OWM ID: https://openweathermap.org/weather-conditions
function mapOwmToWmo(id) {
  if (id == null) return 3;
  // Thunderstorm (2xx)
  if (id >= 200 && id < 300) {
    if (id === 202 || id === 212 || id === 221) return 96; // 강한 뇌우
    return 95;
  }
  // Drizzle (3xx)
  if (id >= 300 && id < 400) return 51;
  // Rain (5xx)
  if (id >= 500 && id < 600) {
    if (id === 500) return 61; // 약한 비
    if (id === 501) return 63; // 비
    if (id === 502 || id === 503 || id === 504) return 65; // 강한 비
    if (id === 511) return 65; // 어는 비
    if (id >= 520 && id <= 522) return 80; // 소나기
    if (id === 531) return 81;
    return 63;
  }
  // Snow (6xx)
  if (id >= 600 && id < 700) {
    if (id === 600) return 71;
    if (id === 601) return 73;
    if (id === 602) return 75;
    if (id === 611 || id === 612 || id === 613) return 77; // 진눈깨비
    if (id >= 615) return 85;
    return 73;
  }
  // Atmosphere (7xx) - 안개/연무 등
  if (id >= 700 && id < 800) return 45;
  // Clear (800)
  if (id === 800) return 0;
  // Clouds (80x)
  if (id === 801) return 1; // 대체로 맑음
  if (id === 802) return 2; // 부분적 흐림
  if (id === 803 || id === 804) return 3; // 흐림
  return 3;
}
