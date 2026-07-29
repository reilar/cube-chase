//--------------------------------------------------------
// Reflective metal cubes on a chase
// 
// 2023-10-27 - Initial version
//--------------------------------------------------------
 
#ifdef GL_ES
precision highp float;
#endif

#define speed 1.2
#define MAX_STEPS 120
#define MAX_DIST 30.0
#define SURF_EPS 0.0012

varying vec2 v_texcoord;

uniform vec2 iResolution;
uniform float iTime;
uniform vec4 iMouse;

mat3 rotX(float a) {
    float c = cos(a), s = sin(a);
    return mat3(
        1.0, 0.0, 0.0,
        0.0, c, -s,
        0.0, s, c
    );
}

mat3 rotY(float a) {
    float c = cos(a), s = sin(a);
    return mat3(
         c, 0.0, s,
        0.0, 1.0, 0.0,
        -s, 0.0, c
    );
}

mat3 rotZ(float a) {
    float c = cos(a), s = sin(a);
    return mat3(
        c, -s, 0.0,
        s,  c, 0.0,
        0.0, 0.0, 1.0
    );
}

float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float hash11(float x) {
    return fract(sin(x * 127.1) * 43758.5453123);
}

float smoothNoise1D(float x) {
    float i = floor(x);
    float f = fract(x);
    float u = f * f * (3.0 - 2.0 * f);
    return mix(hash11(i), hash11(i + 1.0), u);
}

float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);

    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm2D(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
        v += a * noise2D(p);
        p = p * 2.03 + vec2(7.1, 3.7);
        a *= 0.5;
    }
    return v;
}

float waterWaveHeight(vec2 p, float t) {
    float w = 0.0;
    w += 0.70 * sin(p.x * 2.2 + t * 1.1);
    w += 0.45 * sin(p.y * 2.8 - t * 0.9);
    w += 0.30 * sin((p.x + p.y) * 3.4 + t * 1.6);
    return w;
}

vec3 lensFlare(vec2 uv, vec2 lightPos) {
    vec2 dir = uv - lightPos;
    float dist = length(dir);

    float glow = exp(-12.0 * dist * dist);
    float ring0 = exp(-220.0 * pow(abs(dist - 0.18), 2.0));
    float ring1 = exp(-320.0 * pow(abs(dist - 0.33), 2.0));

    vec2 ghostPos0 = lightPos + dir * -0.45;
    vec2 ghostPos1 = lightPos + dir * -0.82;
    vec2 ghostPos2 = lightPos + dir * -1.20;

    float ghost0 = exp(-48.0 * dot(uv - ghostPos0, uv - ghostPos0));
    float ghost1 = exp(-62.0 * dot(uv - ghostPos1, uv - ghostPos1));
    float ghost2 = exp(-74.0 * dot(uv - ghostPos2, uv - ghostPos2));

    float anamorphic = exp(-180.0 * uv.y * uv.y) * exp(-1.6 * abs(uv.x - lightPos.x));

    vec3 col = vec3(1.00, 0.62, 0.28) * glow * 0.34;
    col += vec3(1.00, 0.28, 0.62) * ring0 * 0.18;
    col += vec3(0.70, 0.36, 1.00) * ring1 * 0.12;
    col += vec3(1.00, 0.78, 0.42) * ghost0 * 0.26;
    col += vec3(1.00, 0.32, 0.72) * ghost1 * 0.20;
    col += vec3(0.58, 0.40, 1.00) * ghost2 * 0.16;
    col += vec3(1.00, 0.44, 0.76) * anamorphic * 0.08;

    return col;
}

vec3 chasePath(float a, float t) {
    // Wide elliptical loop, biased upward on screen
    float x = 2.45 * cos(a);
    float z = 0.65 + 0.85 * sin(a);
    float y = 0.22 * sin(0.7 * a + 0.9 * t);
    return vec3(x, y, z);
}

float chasePhase(float t) {
    float chaseSpeed = 0.85;
    float burst = smoothstep(0.55, 0.95, sin(0.38 * t + 0.6));
    float jitter = smoothNoise1D(t * 0.42) - 0.5;

    // Run-away bursts
    float run0 = smoothstep(0.73, 0.98, sin(0.52 * t + 0.9));
    float run1 = smoothstep(0.76, 0.99, sin(0.89 * t + 2.2));
    float runKick = 0.95 * run0 + 0.55 * run1;

    return chaseSpeed * t
         + 0.42 * sin(0.55 * t)
         + 0.18 * sin(2.15 * t + 0.7)
         + 0.75 * burst * sin(1.35 * t + 1.2)
         + 0.28 * jitter
         + runKick;
}

float zoomPulse(float t) {
    // Moody cubes
    float inPulse = smoothstep(0.72, 0.98, sin(0.63 * t + 1.1));
    float outPulse = smoothstep(0.74, 0.98, sin(0.63 * t + 4.2));
    return 1.0 + 0.26 * inPulse - 0.13 * outPulse;
}

void cubeCenters(float t, out vec3 c0, out vec3 c1, out vec3 c2) {
    // Leader runs first, followers echo shortly afterward
    float a0 = chasePhase(t);
    float a1 = chasePhase(t - 0.24) - 1.60;
    float a2 = chasePhase(t - 0.46) - 3.20;

    // Per-cube phase wobble adds different instantaneous travel speeds
    float w0 = 0.10 * sin(1.10 * t + 0.2);
    float w1 = 0.14 * sin(0.86 * t + 1.7) + 0.04 * sin(2.20 * t + 0.3);
    float w2 = 0.17 * sin(1.32 * t + 2.6) + 0.03 * sin(2.70 * t + 1.1);

    c0 = chasePath(a0 + w0, t);
    c1 = chasePath(a1 + w1, t);
    c2 = chasePath(a2 + w2, t);
}

float flareTrigger(vec3 ro) {
    vec3 c0, c1, c2;
    cubeCenters(iTime, c0, c1, c2);

    vec2 sunPos = vec2(0.0, 0.07);
    vec3 d0 = normalize(c0 - ro);
    vec3 d1 = normalize(c1 - ro);
    vec3 d2 = normalize(c2 - ro);

    float f0 = exp(-260.0 * dot(vec2(d0.x, d0.z) - sunPos, vec2(d0.x, d0.z) - sunPos));
    float f1 = exp(-260.0 * dot(vec2(d1.x, d1.z) - sunPos, vec2(d1.x, d1.z) - sunPos));
    float f2 = exp(-260.0 * dot(vec2(d2.x, d2.z) - sunPos, vec2(d2.x, d2.z) - sunPos));

    return clamp(max(f0, max(f1, f2)), 0.0, 1.0);
}

vec2 sceneMap(vec3 p) {
    float t = iTime;
    vec3 c0, c1, c2;
    cubeCenters(t, c0, c1, c2);

    // Leader zooms first, followers zoom shortly after
    vec3 half0 = vec3(0.30 * zoomPulse(t));
    vec3 half1 = vec3(0.30 * zoomPulse(t - 0.18));
    vec3 half2 = vec3(0.30 * zoomPulse(t - 0.34));

    // Independent rotations with different speeds for each cube
    mat3 R0 = rotX(speed * 0.80 * t) * rotY(speed * 1.35 * t) * rotZ(speed * 0.55 * t);
    mat3 R1 = rotX(speed * 1.45 * t) * rotY(speed * 0.70 * t) * rotZ(speed * 1.10 * t);
    mat3 R2 = rotX(speed * 0.60 * t) * rotY(speed * 1.05 * t) * rotZ(speed * 1.65 * t);

    vec3 q0 = transpose(R0) * (p - c0);
    vec3 q1 = transpose(R1) * (p - c1);
    vec3 q2 = transpose(R2) * (p - c2);

    float d0 = sdBox(q0, half0);
    float d1 = sdBox(q1, half1);
    float d2 = sdBox(q2, half2);

    float d = d0;
    float id = 0.0;
    if (d1 < d) { d = d1; id = 1.0; }
    if (d2 < d) { d = d2; id = 2.0; }

    return vec2(d, id);
}

vec3 getNormal(vec3 p) {
    vec2 e = vec2(0.0015, 0.0);
    float dx = sceneMap(p + vec3(e.x, e.y, e.y)).x - sceneMap(p - vec3(e.x, e.y, e.y)).x;
    float dy = sceneMap(p + vec3(e.y, e.x, e.y)).x - sceneMap(p - vec3(e.y, e.x, e.y)).x;
    float dz = sceneMap(p + vec3(e.y, e.y, e.x)).x - sceneMap(p - vec3(e.y, e.y, e.x)).x;
    return normalize(vec3(dx, dy, dz));
}

float softShadow(vec3 ro, vec3 rd) {
    float res = 1.0;
    float t = 0.03;
    for (int i = 0; i < 36; i++) {
        float h = sceneMap(ro + rd * t).x;
        res = min(res, 20.0 * h / t);
        t += clamp(h, 0.02, 0.20);
        if (h < 0.0008 || t > 10.0) break;
    }
    return clamp(res, 0.0, 1.0);
}

vec3 sunsetSky(vec3 rd) {
    // Dark blue sky gradient
    float v = clamp(rd.z * 0.5 + 0.5, 0.0, 1.0);
    vec3 horizonBlue = vec3(0.018, 0.035, 0.070);
    vec3 midBlue = vec3(0.010, 0.022, 0.050);
    vec3 zenithBlue = vec3(0.003, 0.008, 0.020);

    vec3 col = mix(horizonBlue, midBlue, smoothstep(0.00, 0.58, v));
    col = mix(col, zenithBlue, smoothstep(0.50, 1.00, v));

    // Slight horizon haze and edge shaping for depth
    float haze = exp(-28.0 * abs(rd.z - 0.02));
    col += vec3(0.020, 0.040, 0.080) * haze * 0.08;

    float side = pow(clamp(abs(rd.x), 0.0, 1.0), 1.4);
    col *= 1.0 - 0.20 * side;
    return col;
}

vec3 waterBase(vec3 rd) {
    float v = clamp(-rd.z * 0.5 + 0.5, 0.0, 1.0);
    vec3 near = vec3(0.04, 0.20, 0.38);
    vec3 deep = vec3(0.01, 0.06, 0.14);
    vec3 col = mix(near, deep, smoothstep(0.0, 1.0, v));

    // Multi-wave animated water texture
    vec2 wp = vec2(rd.x * 10.0, rd.z * 9.0);
    float wave = waterWaveHeight(wp, iTime);
    float rip = 0.5 + 0.5 * sin(wave * 2.3 + rd.x * 45.0);
    col += vec3(0.03, 0.05, 0.08) * rip * (1.0 - v) * 0.38;

    // Horizon shimmer line
    float shimmer = exp(-120.0 * abs(rd.z - 0.02));
    col += vec3(0.30, 0.18, 0.24) * shimmer * 0.25;
    return col;
}

vec3 envColor(vec3 rd) {
    float horizonBlend = smoothstep(-0.03, 0.05, rd.z);
    vec3 col = mix(waterBase(rd), sunsetSky(rd), horizonBlend);
    float side = pow(clamp(abs(rd.x), 0.0, 1.0), 1.6);
    col *= 1.0 - 0.16 * side;
    return col;
}

vec2 traceScene(vec3 ro, vec3 rd) {
    float t = 0.0;
    float mid = -1.0;

    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * t;
        vec2 h = sceneMap(p);
        if (h.x < SURF_EPS) {
            mid = h.y;
            return vec2(t, mid);
        }
        t += h.x;
        if (t > MAX_DIST) break;
    }

    return vec2(-1.0, -1.0);
}

vec3 metalColor(float id) {
    if (id < 0.5) return vec3(0.78, 0.80, 0.86); // silver
    if (id < 1.5) return vec3(0.20, 0.52, 0.95); // blue
    return vec3(0.84, 0.58, 0.22);               // bronze
}

float metalRoughness(float id) {
    if (id < 0.5) return 0.16;
    if (id < 1.5) return 0.11;
    return 0.22;
}

vec3 shadeMetal(vec3 p, vec3 n, vec3 v, float id) {
    vec3 albedo = metalColor(id);
    float rough = metalRoughness(id);

    vec3 l0 = normalize(vec3(-0.7, 0.85, 0.35));
    vec3 l1 = normalize(vec3(0.65, 0.45, -0.35));
    vec3 lc0 = vec3(1.15, 1.10, 1.05);
    vec3 lc1 = vec3(0.40, 0.55, 0.90);

    float sh0 = softShadow(p + n * 0.01, l0);
    float sh1 = softShadow(p + n * 0.01, l1);

    float ndl0 = max(dot(n, l0), 0.0);
    float ndl1 = max(dot(n, l1), 0.0);

    vec3 h0 = normalize(l0 + v);
    vec3 h1 = normalize(l1 + v);
    float shininess = mix(140.0, 36.0, rough);
    float sp0 = pow(max(dot(n, h0), 0.0), shininess) * (0.6 + 0.5 * (1.0 - rough));
    float sp1 = pow(max(dot(n, h1), 0.0), shininess * 0.8) * (0.6 + 0.5 * (1.0 - rough));

    vec3 direct = albedo * (0.08 + 0.22 * (ndl0 * sh0 + 0.7 * ndl1 * sh1));
    direct += lc0 * sp0 * sh0 + lc1 * sp1 * sh1;

    vec3 r = reflect(-v, n);
    vec3 env = envColor(r);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 5.0);
    vec3 reflected = env * mix(0.45, 1.0, fres) * (1.0 - 0.35 * rough);

    return direct + reflected * albedo;
}

vec3 render(vec3 ro, vec3 rd) {
    vec2 hit = traceScene(ro, rd);
    if (hit.x < 0.0) {
        vec3 bg = envColor(rd);

        // Faint water mirror below the horizon using a reflective plane.
        const float waterZ = -1.45;
        if (rd.z < -0.001) {
            float tw = (waterZ - ro.z) / rd.z;
            if (tw > 0.0) {
                vec3 wp = ro + rd * tw;
                    vec2 wuv = vec2(wp.x, wp.y);
                    float eps = 0.03;
                    float hx = waterWaveHeight(wuv + vec2(eps, 0.0), iTime) - waterWaveHeight(wuv - vec2(eps, 0.0), iTime);
                    float hy = waterWaveHeight(wuv + vec2(0.0, eps), iTime) - waterWaveHeight(wuv - vec2(0.0, eps), iTime);
                    vec3 wn = normalize(vec3(-0.9 * hx, -0.9 * hy, 1.0));

                vec3 wr = reflect(rd, wn);
                vec3 reflected = envColor(wr);

                vec2 mirrorHit = traceScene(wp + wn * 0.02, wr);
                if (mirrorHit.x > 0.0) {
                    vec3 rp = wp + wn * 0.02 + wr * mirrorHit.x;
                    vec3 rn = getNormal(rp);
                    vec3 rv = normalize(wp - rp);
                    vec3 cubeRef = shadeMetal(rp, rn, rv, mirrorHit.y);
                    reflected = mix(reflected, cubeRef, 0.78);
                }

                float fres = pow(1.0 - max(dot(-rd, wn), 0.0), 3.4);
                vec3 wNear = vec3(0.02, 0.10, 0.20);
                vec3 wDeep = vec3(0.03, 0.16, 0.31);
                float depthFade = clamp((waterZ - ro.z) / 3.0, 0.0, 1.0);
                vec3 water = mix(wNear, wDeep, depthFade);

                float ripple = 0.5 + 0.5 * sin(waterWaveHeight(wuv * 1.2, iTime) * 3.0 + iTime * 1.1);
                water += vec3(0.01, 0.02, 0.04) * ripple;

                vec3 mirrorCol = water + reflected * (0.10 + 0.18 * fres);
                bg = mix(bg, mirrorCol, 0.48);
            }
        }

        float vignette = smoothstep(1.35, 0.15, length(rd.xz));
        return bg * (0.85 + 0.15 * vignette);
    }

    float t = hit.x;
    float mid = hit.y;
    vec3 p = ro + rd * t;
    vec3 n = getNormal(p);
    vec3 v = normalize(ro - p);

    vec3 col = shadeMetal(p, n, v, mid);

    // Subtle contact halo to ground the forms
    float rim = pow(1.0 - max(dot(n, v), 0.0), 2.0);
    col += vec3(0.07, 0.11, 0.18) * rim;

    return col;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float zoomPhase = iTime * 0.65;
    float zoomPulse = 1.0 + 0.08 * sin(zoomPhase);
    uv *= 2.35 / zoomPulse;

    // Pull camera back to keep all cubes visible while preserving motion
    float camY = -4.9 + 0.45 * sin(zoomPhase);
    vec3 ro = vec3(0.0, camY, 0.0);
    vec3 rd = normalize(vec3(uv.x, 2.25 - 0.10 * sin(zoomPhase), uv.y));

    vec3 col = render(ro, rd);

    // Mild filmic response and gamma
    col = col / (col + vec3(1.0));
    col = pow(col, vec3(0.4545));

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}

void main(void) {
    mainImage(gl_FragColor, v_texcoord * iResolution.xy);
}

