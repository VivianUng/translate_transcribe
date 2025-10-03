"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useRouter } from "next/navigation";
import { TooltipProvider } from "@/components/TooltipProvider";
import { Eye, EyeOff } from "lucide-react";

export default function UpdatePassword() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rules, setRules] = useState(isStrongPassword(''));
  const [pwRequirementError, setPwRequirementError] = useState('');
  const [confirmPwMismatch, setConfirmPwMismatch] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

    function handlePasswordChange(e) {
    const value = e.target.value;
    setPassword(value);
    setPwRequirementError("");
    setRules(isStrongPassword(value));
  }


  function isStrongPassword(password) {
    const minLength = 8;

    const result = {
      length: password.length >= minLength,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[^A-Za-z0-9]/.test(password),
    };

    return {
      ...result,
      valid: Object.values(result).every(Boolean)
    };
  }

  async function handleUpdatePassword(e) {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);


    const rulesCheck = isStrongPassword(password);
    let errorMessage = "";

    if (!rulesCheck.valid) {
      errorMessage += "Password does not meet all requirements. ";
    }

    if (password !== confirmPassword) {
      errorMessage += "Passwords do not match.";
    }

    if (errorMessage) {
      setPwRequirementError(
        !rulesCheck.valid ? "Password does not meet all requirements." : ""
      );
      setConfirmPwMismatch(
        password !== confirmPassword ? "Passwords do not match." : ""
      );

      setLoading(false);
      return;
    }

    try {
      // Update password via Supabase
      const { error } = await supabase.auth.updateUser({ password });

      setLoading(false);

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      // Success — redirect to main page (signed in)
      router.push("/?toast=updatePwSuccess");
    } catch (err) {
      setLoading(false);
      setErrorMsg("An unexpected error occurred. Please try again.");
      console.error(err);
    }
  }

  return (
    <div className="updatePw-container">
      <h1 className="page-title">Update Password</h1>

      <form onSubmit={handleUpdatePassword}>
        <div className="password-container" style={{ position: "relative" }}>
          <label className="input-label" htmlFor="password">New Password</label>
          <br />

          <div style={{ marginTop: "0.5rem", marginBottom: "1rem" }}>
            <TooltipProvider
              message={pwRequirementError}
              tooltipId="password-requirements-tooltip"
              place="top"
              style={{ display: "inline-block", width: "100%" }}
            >
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter new password"
                value={password}
                maxLength={100}
                onChange={handlePasswordChange}
                required
                className="input-field password-field"
                style={{ margin: 0 }}   // cancel margin so tooltip hugs input
              />
            </TooltipProvider>

            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="toggle-visibility"
              style={{ transform: "none" }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div className="password-checklist">
          <div className={rules.length ? "valid" : "invalid"}>
            {rules.length ? "✅" : "❌"} At least 8 characters
          </div>
          <div className={rules.uppercase ? "valid" : "invalid"}>
            {rules.uppercase ? "✅" : "❌"} At least one uppercase letter (A–Z)
          </div>
          <div className={rules.lowercase ? "valid" : "invalid"}>
            {rules.lowercase ? "✅" : "❌"} At least one lowercase letter (a–z)
          </div>
          <div className={rules.number ? "valid" : "invalid"}>
            {rules.number ? "✅" : "❌"} At least one number (0–9)
          </div>
          <div className={rules.special ? "valid" : "invalid"}>
            {rules.special ? "✅" : "❌"} At least one special character (!@#%&* etc.)
          </div>
        </div>

        <div className="password-container" style={{ position: "relative" }}>
          <label className="input-label" htmlFor="password">Confirm Password</label>
          <br />

          {/* wrapper that cancels input margin */}
          <div style={{ marginTop: "0.5rem", marginBottom: "2rem" }}>
            <TooltipProvider
              message={confirmPwMismatch}
              tooltipId="password-tooltip"
              place="top"
              style={{ display: "inline-block", width: "100%" }}
            >
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Confirm new password"
                value={confirmPassword}
                maxLength={100}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setConfirmPwMismatch("");
                }}
                required
                className="input-field password-field"
                style={{ margin: 0 }}
              />
            </TooltipProvider>

            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="toggle-visibility"
              style={{ transform: "none" }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="button updatePw-button"
        >
          {loading ? "Updating..." : "Update Password"}
        </button>
      </form>

      {errorMsg && (
        <div className="error-message">
          {errorMsg}
        </div>
      )}
    </div>
  );
}
