// components/LanguageSelect.js
import Select from "react-select";
import { useLanguages } from "@/contexts/LanguagesContext";

export default function LanguageSelect({
  mounted,
  value,
  setValue,
  excludeAuto = false,
  isDisabled = false,
  className = "",
}) {
  const { languages, error } = useLanguages();

  if (!mounted) return null;
  // if (error) return <p>Error loading languages</p>;
  if (error) return (
    <Select
      options={[]}
      value={null}
      onChange={() => {}}
      classNamePrefix="react-select"
      className={className}
      isDisabled={isDisabled}
    />
  )
  if (!languages) return null; // still loading

  const options = excludeAuto
    ? languages.filter((opt) => opt.value !== "auto")
    : languages;

  return (
    <Select
      options={options}
      value={options.find((opt) => opt.value === value) || null}
      onChange={(opt) => !isDisabled && setValue(opt.value)}
      classNamePrefix="react-select"
      className={className}
      isDisabled={isDisabled}
    />
  );
}
