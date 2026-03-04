"use client";

import * as React from "react";
import { useState, useId, useEffect, useRef } from "react";
import { Eye, EyeOff, ArrowRight, Loader2, Mail, Lock, User } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/* ─── Inline Shader Canvas (right panel) ─── */
function ShaderCanvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const vsSource = `
    attribute vec4 aVertexPosition;
    void main() {
      gl_Position = aVertexPosition;
    }
  `;

    const fsSource = `
    precision highp float;
    uniform vec2 iResolution;
    uniform float iTime;

    const float overallSpeed = 0.2;
    const float gridSmoothWidth = 0.015;
    const float axisWidth = 0.05;
    const float majorLineWidth = 0.025;
    const float minorLineWidth = 0.0125;
    const float majorLineFrequency = 5.0;
    const float minorLineFrequency = 1.0;
    const vec4 gridColor = vec4(0.5);
    const float scale = 5.0;
    const vec4 lineColor = vec4(0.96, 0.65, 0.33, 1.0);
    const float minLineWidth = 0.01;
    const float maxLineWidth = 0.2;
    const float lineSpeed = 1.0 * overallSpeed;
    const float lineAmplitude = 1.0;
    const float lineFrequency = 0.2;
    const float warpSpeed = 0.2 * overallSpeed;
    const float warpFrequency = 0.5;
    const float warpAmplitude = 1.0;
    const float offsetFrequency = 0.5;
    const float offsetSpeed = 1.33 * overallSpeed;
    const float minOffsetSpread = 0.6;
    const float maxOffsetSpread = 2.0;
    const int linesPerGroup = 16;

    #define drawCircle(pos, radius, coord) smoothstep(radius + gridSmoothWidth, radius, length(coord - (pos)))
    #define drawSmoothLine(pos, halfWidth, t) smoothstep(halfWidth, 0.0, abs(pos - (t)))
    #define drawCrispLine(pos, halfWidth, t) smoothstep(halfWidth + gridSmoothWidth, halfWidth, abs(pos - (t)))
    #define drawPeriodicLine(freq, width, t) drawCrispLine(freq / 2.0, width, abs(mod(t, freq) - (freq) / 2.0))

    float drawGridLines(float axis) {
      return drawCrispLine(0.0, axisWidth, axis)
            + drawPeriodicLine(majorLineFrequency, majorLineWidth, axis)
            + drawPeriodicLine(minorLineFrequency, minorLineWidth, axis);
    }

    float drawGrid(vec2 space) {
      return min(1.0, drawGridLines(space.x) + drawGridLines(space.y));
    }

    float random(float t) {
      return (cos(t) + cos(t * 1.3 + 1.3) + cos(t * 1.4 + 1.4)) / 3.0;
    }

    float getPlasmaY(float x, float horizontalFade, float offset) {
      return random(x * lineFrequency + iTime * lineSpeed) * horizontalFade * lineAmplitude + offset;
    }

    void main() {
      vec2 fragCoord = gl_FragCoord.xy;
      vec4 fragColor;
      vec2 uv = fragCoord.xy / iResolution.xy;
      vec2 space = (fragCoord - iResolution.xy / 2.0) / iResolution.x * 2.0 * scale;

      float horizontalFade = 1.0 - (cos(uv.x * 6.28) * 0.5 + 0.5);
      float verticalFade = 1.0 - (cos(uv.y * 6.28) * 0.5 + 0.5);

      space.y += random(space.x * warpFrequency + iTime * warpSpeed) * warpAmplitude * (0.5 + horizontalFade);
      space.x += random(space.y * warpFrequency + iTime * warpSpeed + 2.0) * warpAmplitude * horizontalFade;

      vec4 lines = vec4(0.0);
      vec4 bgColor1 = vec4(0.06, 0.03, 0.0, 1.0);
      vec4 bgColor2 = vec4(0.15, 0.06, 0.0, 1.0);

      for(int l = 0; l < linesPerGroup; l++) {
        float normalizedLineIndex = float(l) / float(linesPerGroup);
        float offsetTime = iTime * offsetSpeed;
        float offsetPosition = float(l) + space.x * offsetFrequency;
        float rand = random(offsetPosition + offsetTime) * 0.5 + 0.5;
        float halfWidth = mix(minLineWidth, maxLineWidth, rand * horizontalFade) / 2.0;
        float offset = random(offsetPosition + offsetTime * (1.0 + normalizedLineIndex)) * mix(minOffsetSpread, maxOffsetSpread, horizontalFade);
        float linePosition = getPlasmaY(space.x, horizontalFade, offset);
        float line = drawSmoothLine(linePosition, halfWidth, space.y) / 2.0 + drawCrispLine(linePosition, halfWidth * 0.15, space.y);

        float circleX = mod(float(l) + iTime * lineSpeed, 25.0) - 12.0;
        vec2 circlePosition = vec2(circleX, getPlasmaY(circleX, horizontalFade, offset));
        float circle = drawCircle(circlePosition, 0.01, space) * 4.0;

        line = line + circle;
        lines += line * lineColor * rand;
      }

      fragColor = mix(bgColor1, bgColor2, uv.x);
      fragColor *= verticalFade;
      fragColor.a = 1.0;
      fragColor += lines;

      gl_FragColor = fragColor;
    }
  `;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const gl = canvas.getContext("webgl");
        if (!gl) return;

        const loadShader = (type: number, source: string) => {
            const shader = gl.createShader(type);
            if (!shader) return null;
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        };

        const vs = loadShader(gl.VERTEX_SHADER, vsSource);
        const fs = loadShader(gl.FRAGMENT_SHADER, fsSource);
        if (!vs || !fs) return;

        const prog = gl.createProgram()!;
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;

        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
            gl.STATIC_DRAW,
        );

        const posLoc = gl.getAttribLocation(prog, "aVertexPosition");
        const resLoc = gl.getUniformLocation(prog, "iResolution");
        const timeLoc = gl.getUniformLocation(prog, "iTime");

        const resize = () => {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            gl.viewport(0, 0, canvas.width, canvas.height);
        };

        const ro = new ResizeObserver(resize);
        ro.observe(canvas);
        resize();

        let animId: number;
        const t0 = Date.now();
        const render = () => {
            const t = (Date.now() - t0) / 1000;
            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.useProgram(prog);
            gl.uniform2f(resLoc, canvas.width, canvas.height);
            gl.uniform1f(timeLoc, t);
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(posLoc);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            animId = requestAnimationFrame(render);
        };
        animId = requestAnimationFrame(render);

        return () => {
            ro.disconnect();
            cancelAnimationFrame(animId);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}


/* ─── Shared input style ─── */
const inputCls =
    "w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/25 outline-none transition-all duration-200 focus:border-orange-400/60 focus:bg-white/8 focus:ring-1 focus:ring-orange-400/20 disabled:opacity-50";

/* ─── Generic input ─── */
function Field({
    label,
    ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
    const id = useId();
    return (
        <div className="space-y-1.5">
            <label htmlFor={id} className="block text-sm font-semibold text-white">
                {label}
            </label>
            <input id={id} className={inputCls} {...props} />
        </div>
    );
}

/* ─── Password field ─── */
function PasswordField({
    label,
    ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
    const id = useId();
    const [show, setShow] = useState(false);
    return (
        <div className="space-y-1.5">
            <label htmlFor={id} className="block text-sm font-semibold text-white">
                {label}
            </label>
            <div className="relative">
                <input
                    id={id}
                    type={show ? "text" : "password"}
                    className={cn(inputCls, "pr-10")}
                    {...props}
                />
                <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    className="absolute inset-y-0 right-3 flex items-center text-white/40 hover:text-white/80 transition-colors"
                    aria-label={show ? "Hide password" : "Show password"}
                >
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
            </div>
        </div>
    );
}

/* ─── Sign In Form ─── */
interface SignInFormProps {
    onSubmit: (email: string, password: string) => Promise<void>;
    loading?: boolean;
    onToggle: () => void;
    onGoogleLogin?: () => void;
    googleLoading?: boolean;
}
function SignInForm({ onSubmit, loading, onToggle, onGoogleLogin, googleLoading }: SignInFormProps) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    return (
        <form
            onSubmit={async (e) => {
                e.preventDefault();
                await onSubmit(email, password);
            }}
            className="flex flex-col gap-5"
        >
            <div className="space-y-1">
                <h1 className="text-2xl font-bold text-white">Sign in to your account</h1>
                <p className="text-sm text-white/45">Enter your email below to sign in</p>
            </div>

            <Field
                label="Email"
                type="email"
                placeholder="m@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
            />

            <PasswordField
                label="Password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
            />

            <div className="flex justify-end -mt-2">
                <a
                    href="/forgot-password"
                    className="text-xs text-orange-300/80 hover:text-orange-200 hover:underline transition-colors"
                >
                    Forgot password?
                </a>
            </div>

            <button
                type="submit"
                disabled={loading}
                className="w-full h-10 rounded-lg border border-white/15 bg-white/5 text-sm font-semibold text-white flex items-center justify-center gap-2 hover:bg-white/10 hover:border-orange-400/40 transition-all duration-200 disabled:opacity-60"
            >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Sign In
            </button>

            <p className="text-center text-sm text-white/50">
                Don't have an account?{" "}
                <button
                    type="button"
                    onClick={onToggle}
                    className="font-semibold text-orange-300 hover:text-orange-200 hover:underline transition-colors"
                >
                    Sign up
                </button>
            </p>

            {/* Divider */}
            <div className="relative text-center text-xs">
                <span className="relative z-10 bg-[#080808] px-3 text-white/35">Or continue with</span>
                <div className="absolute inset-0 top-1/2 border-t border-white/10" />
            </div>

            <button
                type="button"
                onClick={onGoogleLogin}
                disabled={googleLoading}
                className="w-full h-10 rounded-lg border border-white/12 bg-white/4 text-sm font-medium text-white flex items-center justify-center gap-3 hover:bg-white/8 transition-all duration-200 disabled:opacity-60"
            >
                {googleLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="h-4 w-4" />
                )}
                Continue with Google
            </button>
        </form>
    );
}

/* ─── Sign Up Form ─── */
interface SignUpFormProps {
    onSubmit: (name: string, email: string, password: string) => Promise<void>;
    loading?: boolean;
    onToggle: () => void;
    onGoogleLogin?: () => void;
    googleLoading?: boolean;
}
function SignUpForm({ onSubmit, loading, onToggle, onGoogleLogin, googleLoading }: SignUpFormProps) {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [pwError, setPwError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirm) {
            setPwError("Passwords do not match.");
            return;
        }
        setPwError("");
        await onSubmit(name, email, password);
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="space-y-1">
                <h1 className="text-2xl font-bold text-white">Create an account</h1>
                <p className="text-sm text-white/45">Enter your details below to sign up</p>
            </div>

            <Field
                label="Full Name"
                type="text"
                placeholder="Arjun Patel"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
            />

            <Field
                label="Email"
                type="email"
                placeholder="m@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
            />

            <PasswordField
                label="Password"
                placeholder="Password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPwError(""); }}
                autoComplete="new-password"
                required
            />

            <div className="space-y-1.5">
                <PasswordField
                    label="Confirm Password"
                    placeholder="Confirm password"
                    value={confirm}
                    onChange={(e) => { setConfirm(e.target.value); setPwError(""); }}
                    autoComplete="new-password"
                    required
                />
                {pwError && (
                    <p className="text-xs text-red-400 mt-1">{pwError}</p>
                )}
            </div>

            <button
                type="submit"
                disabled={loading}
                className="w-full h-10 rounded-lg border border-white/15 bg-white/5 text-sm font-semibold text-white flex items-center justify-center gap-2 hover:bg-white/10 hover:border-orange-400/40 transition-all duration-200 disabled:opacity-60"
            >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Sign Up
            </button>

            <p className="text-center text-sm text-white/50">
                Already have an account?{" "}
                <button
                    type="button"
                    onClick={onToggle}
                    className="font-semibold text-orange-300 hover:text-orange-200 hover:underline transition-colors"
                >
                    Sign in
                </button>
            </p>

            {/* Divider */}
            <div className="relative text-center text-xs">
                <span className="relative z-10 bg-[#000000] px-3 text-white/35">Or continue with</span>
                <div className="absolute inset-0 top-1/2 border-t border-white/10" />
            </div>

            <button
                type="button"
                onClick={onGoogleLogin}
                disabled={googleLoading}
                className="w-full h-10 rounded-lg border border-white/12 bg-white/4 text-sm font-medium text-white flex items-center justify-center gap-3 hover:bg-white/8 transition-all duration-200 disabled:opacity-60"
            >
                {googleLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <img
                        src="https://www.svgrepo.com/show/475656/google-color.svg"
                        alt="Google"
                        className="h-4 w-4"
                    />
                )}
                Continue with Google
            </button>
        </form>
    );
}

/* ─── Main AuthUI ─── */
export interface AuthUIProps {
    onSignIn: (email: string, password: string) => Promise<void>;
    onSignUp: (name: string, email: string, password: string) => Promise<void>;
    signInLoading?: boolean;
    signUpLoading?: boolean;
    defaultTab?: "signin" | "signup";
    onGoogleLogin?: () => void;
    googleLoading?: boolean;
}


export function AuthUI({
    onSignIn,
    onSignUp,
    signInLoading,
    signUpLoading,
    defaultTab = "signin",
    onGoogleLogin,
    googleLoading,
}: AuthUIProps) {
    const [isSignIn, setIsSignIn] = useState(defaultTab === "signin");

    return (
        <div className="w-full min-h-screen flex" style={{ background: "#000000" }}>

            {/* ── LEFT: form panel — pure black background ── */}
            <div
                className="flex flex-1 items-center justify-center px-8 py-12 min-h-screen"
                style={{ background: "#000000" }}
            >
                <div className="w-full max-w-sm animate-slide-up">
                    {isSignIn ? (
                        <SignInForm
                            onSubmit={onSignIn}
                            loading={signInLoading}
                            onToggle={() => setIsSignIn(false)}
                            onGoogleLogin={onGoogleLogin}
                            googleLoading={googleLoading}
                        />
                    ) : (
                        <SignUpForm
                            onSubmit={onSignUp}
                            loading={signUpLoading}
                            onToggle={() => setIsSignIn(true)}
                            onGoogleLogin={onGoogleLogin}
                            googleLoading={googleLoading}
                        />
                    )}
                </div>
            </div>

            {/* ── RIGHT: AVENIR branding top, shader animation center ── */}
            <div
                className="hidden md:flex flex-1 overflow-hidden flex-col"
                style={{ background: "#000000" }}
            >
                {/* Top zone: AVENIR + subtitle — no animation behind, pure dark */}
                <div className="flex flex-col items-center justify-center pt-16 pb-8 px-8" style={{ background: "#000000" }}>
                    <span
                        className="font-extrabold tracking-widest select-none"
                        style={{
                            fontSize: "clamp(3rem, 6vw, 5.5rem)",
                            background:
                                "linear-gradient(135deg, oklch(0.837 0.128 66.29) 0%, oklch(0.95 0.10 75) 50%, oklch(0.78 0.14 55) 100%)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            backgroundClip: "text",
                            filter: "drop-shadow(0 0 28px oklch(0.7 0.14 66 / 0.5))",
                            letterSpacing: "0.18em",
                        }}
                    >
                        AVENIR
                    </span>
                    <p className="text-white/40 text-sm tracking-[0.25em] uppercase font-light mt-3">
                        Find where you belong
                    </p>
                </div>

                {/* Center zone: shader animation contained here — won't bleed into text above */}
                <div className="flex-1 relative">
                    <ShaderCanvas />
                </div>
            </div>
        </div>
    );
}
