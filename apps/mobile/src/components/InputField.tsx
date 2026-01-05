type InputFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  helperText?: string;
};

export function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  helperText,
}: InputFieldProps): JSX.Element {
  return (
    <label className="form-field">
      <span className="form-label">{label}</span>
      <input
        className="form-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
      />
      {helperText ? <span className="form-helper">{helperText}</span> : null}
    </label>
  );
}
