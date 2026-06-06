import { inputClassFor, INPUT_STYLE } from "../../shared/components/ui/inputClass";
import { NO_AUTOCOMPLETE_PROPS } from "../../config";
import { SearchIcon } from "../../shared/components/icons";
import { usePublicI18n } from "../../shared/publicI18n";

interface BlogSearchProps {
  value: string;
  onChange: (value: string) => void;
}

/** Search input used in the blog hero. Controlled component. */
export default function BlogSearch({ value, onChange }: BlogSearchProps) {
  const { publicT } = usePublicI18n();

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      role="search"
      className="mx-auto max-w-md"
      noValidate
      autoComplete="off"
    >
      <div className="relative">
        <SearchIcon
          size={16}
          style={{
            position: "absolute",
            left: 20,
            top: "50%",
            transform: "translateY(-50%)",
            color: "#6b7280",
          }}
        />
        <input
          type="text"
          placeholder={publicT.blog.searchPlaceholder}
          aria-label={publicT.blog.searchAria}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          {...NO_AUTOCOMPLETE_PROPS}
          className={`${inputClassFor("search")} pl-12`}
          style={INPUT_STYLE}
        />
      </div>
    </form>
  );
}
