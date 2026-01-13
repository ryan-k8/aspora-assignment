# Weather-Based Commute Advisor

## TLDR

![alt text](/resources/diagram.png)

the API utilizes a rules based recommendation engine with a simple and clean architecture that maintains seperation of concerns between the business logic, data layers and http handling. simple interface based abstraction allows flexibility of swapping implementations for weather api, recommendation strategy, cache etc. in future if required with ease while providing easy testing capabilities due to loose coupling and cohesion. a geohash based approach has been used for caching responses responses at city level (~5km).

openmeteo as weather api (hourly forecast)
in-memory cache (geohash based caching for "city" / 10 min)
rules-based recommendation engine [calculations made for T-30,T,T+30 window]

endpoints:

- `/health-check` (GET)
- `/commute-advice` (POST)

### getting started

clone the repo and run

```bash
npm install
```

create `.env` file specifiying `PORT` (default 3000) and then run

```bash
npm run dev
```

postman collection (v2 JSON) has been provided in `resources/` which can be imported in postman for testing (NOTE: base_url variable is set to `http://localhost:3000` in collection)

### API Example

endpoint: `{{base_url}}/commute-advice`
method: `POST`
header: `Content-Type: application/json`

request body:

```json
{
  "home": { "latitude": 40.7128, "longitude": -74 },
  "office": { "latitude": 37.777, "longitude": -122 },
  "plannedDeparture": "2026-01-15T07:00:00Z",
  "commuteDuration": 40
}
```

response:

```json
{
  "risk_score": 35,
  "recommendation": "No change needed",
  "recommended_departure": "2026-01-15T07:00:00Z",
  "risk_breakdown": {
    "precipitationProbability": {
      "score": 25,
      "value": "52%",
      "severity": "Medium"
    },
    "aqi": {
      "score": 10,
      "value": "61",
      "severity": "Low"
    },
    "wind": {
      "score": 0,
      "value": "22.2 km/h",
      "severity": "Low"
    },
    "visibility": {
      "score": 0,
      "value": "3800 m",
      "severity": "Low"
    },
    "temperature": {
      "score": 0,
      "value": "8.0°C",
      "severity": "Low"
    }
  },
  "reason": [
    "Rain probability 52% during planned window",
    "Air quality AQI 61 during planned window"
  ]
}
```

## REFLECTION

if more time was permitted and possible for me to invest, i would have explored a fuzzy logic based solution for the determining risk score and recommendation instead of a "random" rule based approach.

The current system uses sharp, arbitrary thresholds. For example, a precipitation probability of 60% gets a risk score of 15, but 60.1% jumps to 35. This binary-like classification doesn't capture the continuous and often ambiguous nature of weather-related risk.

**How Fuzzy Logic Would Help**:
Fuzzy logic excels at handling this kind of imprecision. Instead of rigid `if/else` statements, it uses "degrees of truth."

1.  **Fuzzification**: We would define weather parameters not as single values but as members of overlapping sets. For example, "Precipitation Probability" could be defined with fuzzy sets like `Low`, `Medium`, and `High`. A value of 55% might be considered `0.25 Low`, `0.75 Medium`, and `0.0 High`.

2.  **Fuzzy Rule Base**: The rules would become more intuitive and less brittle. Instead of `if p > 60%`, we would have rules like:
    - `IF Precipitation is High OR AQI is Unhealthy THEN Risk is High.`
    - `IF Wind is Strong AND Visibility is Poor THEN Risk is Very High.`

3.  **Inference and Defuzzification**: The fuzzy inference engine would evaluate these rules simultaneously, weighing them based on the "degrees of truth" of their conditions. The combined fuzzy result would then be "defuzzified" back into a single, crisp risk score.

This approach would produce a smoother, more continuous risk landscape, eliminating the sharp jumps in recommendations that can occur when a single metric crosses an arbitrary line. It better reflects the real-world principle that risk is not a series of steps, but a continuous gradient.

### RESPONSE CACHING

The system implements an in-memory caching strategy to minimize latency and reduce redundant external API calls. This is crucial for handling concurrent requests for nearby locations efficiently.

**Geohash-Based Caching**

- **What is Geohash?**: A geohash is a public domain geocoding system that encodes a geographic location (latitude and longitude) into a short string of letters and digits. It's a hierarchical system, meaning that longer geohashes represent smaller, more precise areas.

- **Precision and Cache Granularity**: The implementation uses a geohash **precision of 5**. A 5-character geohash represents a rectangular area of approximately **~5km x 5km**. This provides an effective "city-level" caching granularity, grouping requests for nearby locations (e.g., home and office within the same city district) into a single cached entry. This avoids making separate API calls for coordinates that are geographically close.

| Geohash Length | Approx. Dimensions  |
| :------------- | :------------------ |
| 1              | ≤ 5,000km × 5,000km |
| 2              | ≤ 1,250km × 625km   |
| 3              | ≤ 156km × 156km     |
| 4              | ≤ 39km × 19.5km     |
| **5**          | **≤ 5km × 5km**     |
| 6              | ≤ 1.2km × 0.61km    |
| 7              | ≤ 152m × 152m       |

- **Cache Key and TTL**: The cache key is a combination of the geohash, the start date, and the end date of the weather forecast window (e.g., `u4pru_2026-01-13_2026-01-14`). Each entry has a **Time-to-Live (TTL) of 10 minutes** to balance data freshness with performance.

### EDGE CASE HANDLING

The system incorporates several checks to handle invalid inputs and unexpected scenarios, ensuring stability and reliable recommendations.

**Input Validation**:

- **Geographic Coordinates**: Latitude is validated to be within `[-90, 90]` and longitude within `[-180, 180]`.
- **Date and Time**: The `plannedDeparture` is validated to be a valid ISO 8601 string or the special value `"leave now"`. The system rejects dates in the past or more than 14 days in the future (aligning with the forecast provider's limits).
- **Commute Duration**: The duration is validated to be a positive value up to a maximum of 720 minutes (12 hours) to prevent nonsensical calculations.

**System Resilience**:

- **API Timeouts**: A 5-second timeout is enforced on all external API calls to prevent the system from hanging on slow network responses.
- **Worst-Case Aggregation**: The risk score is calculated based on the _worst_ weather conditions across both home and office locations for the entire commute duration. This conservative approach prioritizes user safety.
- **Score Capping**: The total risk score is capped at 100 to maintain a consistent and understandable scale.

## CORE Engine

The Commute Weather Advisor employs a deterministic, rule-based recommendation engine that analyzes weather conditions to provide actionable commute guidance. The system calculates risk scores based on multiple weather factors, aggregates worst-case conditions across commute duration and locations, and applies threshold-based logic to determine optimal departure times.

This ensures consistent, explainable decisions based on quantitative risk assessment.

### Risk Score Computation

The risk score $R$ for a given time window is computed as:

$$R = \min\left(100, R_p + R_a + R_w + R_v + R_t\right)$$

Where:

- $R_p$: Precipitation risk score (0-45)
- $R_a$: Air Quality Index risk score (0-40)
- $R_w$: Wind risk score (0-25)
- $R_v$: Visibility risk score (0-20)
- $R_t$: Temperature risk score (0-10)

### Factor Weightages

Each weather factor contributes to the total risk with the following maximum weights:

- **Precipitation ($R_p$)**: 45 points (highest priority for commute disruption)
- **Air Quality ($R_a$)**: 40 points (health impact consideration)
- **Wind ($R_w$)**: 25 points (affects driving conditions)
- **Visibility ($R_v$)**: 20 points (safety critical)
- **Temperature ($R_t$)**: 10 points (comfort factor)

**Note**: While precipitation has a maximum weight of 40 points, its tiered scoring (40/30/20/10) gives it significant influence at higher probabilities, making it effectively the most impactful factor for moderate to high risk scenarios.

### Precipitation Risk

$$
R_p = \begin{cases}
45 & \text{if } p > 80\% \\
35 & \text{if } 60\% < p \leq 80\% \\
25 & \text{if } 40\% < p \leq 60\% \\
15 & \text{if } 20\% < p \leq 40\% \\
0 & \text{if } p \leq 20\%
\end{cases}
$$

Where $p$ is the precipitation probability.

### Air Quality Risk

$$
R_a = \begin{cases}
40 & \text{if } a > 150 \\
25 & \text{if } 100 < a \leq 150 \\
10 & \text{if } 50 < a \leq 100 \\
0 & \text{if } a \leq 50
\end{cases}
$$

Where $a$ is the European AQI value.

### Wind Risk

$$
R_w = \begin{cases}
25 & \text{if } w > 40 \\
15 & \text{if } 25 < w \leq 40 \\
0 & \text{if } w \leq 25
\end{cases}
$$

Where $w$ is wind speed in km/h.

### Visibility Risk

$$
R_v = \begin{cases}
20 & \text{if } v < 500 \\
10 & \text{if } 500 \leq v < 2000 \\
0 & \text{if } v \geq 2000
\end{cases}
$$

Where $v$ is visibility in meters.

### Temperature Risk

$$
R_t = \begin{cases}
10 & \text{if } t < 0^\circ\text{C or } t > 35^\circ\text{C} \\
0 & \text{otherwise}
\end{cases}
$$

Where $t$ is temperature in Celsius.

## Worst-Case Aggregation

For each time window, the risk score is computed using the worst-case conditions across the commute:

$$R_\text{window} = \min\left(100, \max_{\substack{t \in [t_0, t_0 + d] \\ l \in \{home, office\}}} (R_p(t,l) + R_a(t,l) + R_w(t,l) + R_v(t,l) + R_t(t,l))\right)$$

Where:

- $t_0$: Departure time
- $d$: Commute duration (default 45 minutes)
- $l$: Location (home or office)

## Time Window Evaluation

Three departure times are evaluated:

- **Planned**: $t_p$ (user-specified)
- **Early**: $t_e = t_p - 30$ minutes
- **Late**: $t_l = t_p + 30$ minutes

Risk scores: $R_p$, $R_e$, $R_l$

## Recommendation Algorithm

### Phase 1: Low Risk Assessment

```
if R_p < 25:
    return "No change needed"
```

### Phase 2: High Risk Assessment

```
if R_p > 70 and R_e > 70 and R_l > 70:
    return "Avoid travel if possible"
```

### Phase 3: Improvement Analysis

Compute improvement deltas:
$$\Delta_e = R_p - R_e$$
$$\Delta_l = R_p - R_l$$

### Phase 4: Recommendation Selection

The recommendation logic follows:

```
if Δ_e > 15 and Δ_l > 15:
    if R_e < R_l:
        recommend "Leave 30 minutes earlier"
    else:
        recommend "Leave 30 minutes later"
else if Δ_e > 15:
    recommend "Leave 30 minutes earlier"
else if Δ_l > 15:
    recommend "Leave 30 minutes later"
else:
    return "No change needed"
```
