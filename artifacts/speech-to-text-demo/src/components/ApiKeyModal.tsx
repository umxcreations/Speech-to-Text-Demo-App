import { useState } from "react";
import {
  Key,
  ShieldCheck,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Zap,
  RefreshCw,
  Cpu,
} from "lucide-react";
import { testGroqApiKey } from "../lib/groq-api";

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverKeyMasked: string | null;
  hasServerKey: boolean;
  customKey: string;
  onSaveCustomKey: (key: string) => void;
}

export function ApiKeyModal({
  isOpen,
  onClose,
  serverKeyMasked,
  hasServerKey,
  customKey,
  onSaveCustomKey,
}: ApiKeyModalProps) {
  const [inputValue, setInputValue] = useState(customKey);
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success?: boolean;
    message?: string;
    error?: string;
    whisperModels?: string[];
  } | null>(null);

  if (!isOpen) return null;

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const activeKeyToTest = inputValue.trim() || undefined;
      const res = await testGroqApiKey(activeKeyToTest);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message || "Failed to reach server test endpoint",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    onSaveCustomKey(inputValue.trim());
    onClose();
  };

  const handleUseServerKey = () => {
    setInputValue("");
    onSaveCustomKey("");
    setTestResult(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-key-modal-title"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-[#d5d4cb] bg-[#fffaf0] p-6 shadow-2xl transition-all">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e85b48]/10 text-[#e85b48]">
              <Key size={18} />
            </div>
            <div>
              <h2
                id="api-key-modal-title"
                className="text-base font-bold text-[#263b48]"
              >
                Groq API Configuration
              </h2>
              <p className="text-xs text-[#737b77]">
                Whisper Speech-to-Text LPU inference credentials
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#737b77] hover:bg-[#e9e4d8] hover:text-[#263b48]"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Server status banner */}
        <div
          className={`mb-4 rounded-xl border p-3.5 ${
            hasServerKey
              ? "border-[#b9d8cb] bg-[#e8f3ed]"
              : "border-[#e0ded6] bg-[#f3f0e7]"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck
                size={16}
                className={hasServerKey ? "text-[#368064]" : "text-[#737b77]"}
              />
              <span className="text-xs font-bold text-[#263b48]">
                Server Environment Key:
              </span>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-bold ${
                hasServerKey
                  ? "bg-[#368064]/15 text-[#24634c]"
                  : "bg-[#737b77]/15 text-[#737b77]"
              }`}
            >
              {hasServerKey ? "Active & Configured" : "Not Set"}
            </span>
          </div>
          {hasServerKey && (
            <p className="mt-1.5 font-mono text-xs text-[#368064]">
              {serverKeyMasked}
            </p>
          )}
        </div>

        {/* Custom Key Input */}
        <div className="mb-4">
          <label
            htmlFor="groq-api-key-input"
            className="mb-1.5 block text-xs font-bold text-[#263b48]"
          >
            Custom Groq API Key (Optional override)
          </label>
          <div className="relative flex items-center">
            <input
              id="groq-api-key-input"
              type={showKey ? "text" : "password"}
              placeholder="gsk_..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="w-full rounded-xl border border-[#c9c9be] bg-[#f9f6ef] px-3.5 py-2.5 pr-10 font-mono text-xs text-[#263b48] outline-none focus:border-[#e85b48] focus:ring-2 focus:ring-[#e85b48]/20"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 text-[#737b77] hover:text-[#263b48]"
              aria-label={showKey ? "Hide API key" : "Show API key"}
            >
              {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-[#737b77]">
            If left blank, the server will use its pre-configured Groq key. Your
            key is stored only in your local browser session.
          </p>
        </div>

        {/* Test connection result */}
        {testResult && (
          <div
            className={`mb-4 rounded-xl border p-3 text-xs ${
              testResult.success
                ? "border-[#b9d8cb] bg-[#e8f3ed] text-[#24634c]"
                : "border-[#efc4bb] bg-[#fff0ec] text-[#9f4438]"
            }`}
          >
            <div className="flex items-center gap-2 font-bold">
              {testResult.success ? (
                <CheckCircle2 size={15} />
              ) : (
                <AlertCircle size={15} />
              )}
              <span>
                {testResult.success ? "Connection Verified" : "Verification Failed"}
              </span>
            </div>
            <p className="mt-1 text-[11px]">
              {testResult.message || testResult.error}
            </p>
            {testResult.whisperModels && testResult.whisperModels.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {testResult.whisperModels.map((m) => (
                  <span
                    key={m}
                    className="flex items-center gap-1 rounded bg-[#368064]/20 px-1.5 py-0.5 font-mono text-[10px] font-bold"
                  >
                    <Cpu size={10} /> {m}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <button
            type="button"
            onClick={handleTest}
            disabled={isTesting}
            className="flex items-center gap-1.5 rounded-xl border border-[#c9c9be] bg-[#e9e4d8] px-3.5 py-2 text-xs font-bold text-[#263b48] hover:bg-[#ded8cb] disabled:opacity-50"
          >
            {isTesting ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Zap size={13} className="text-[#e85b48]" />
            )}
            <span>Test Connection</span>
          </button>

          <div className="flex items-center gap-2">
            {customKey && (
              <button
                type="button"
                onClick={handleUseServerKey}
                className="rounded-xl px-3 py-2 text-xs font-semibold text-[#737b77] hover:text-[#263b48]"
              >
                Reset to Server Key
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              className="rounded-xl bg-[#263b48] px-4 py-2 text-xs font-bold text-[#fffaf0] hover:bg-[#1a2933]"
            >
              Save & Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
