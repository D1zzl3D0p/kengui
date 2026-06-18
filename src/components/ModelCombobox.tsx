import { Autocomplete } from '@base-ui/react/autocomplete';

interface ModelComboboxProps {
  id: string;
  value: string;
  options: readonly string[];
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

function fuzzyMatch(item: string, query: string): boolean {
  const normalizedItem = item.toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  if (normalizedItem.includes(normalizedQuery)) return true;

  let queryIndex = 0;
  for (const char of normalizedItem) {
    if (char === normalizedQuery[queryIndex]) {
      queryIndex += 1;
      if (queryIndex === normalizedQuery.length) return true;
    }
  }
  return false;
}

export function ModelCombobox({
  id,
  value,
  options,
  placeholder = 'Search models',
  disabled = false,
  onChange,
}: ModelComboboxProps) {
  return (
    <Autocomplete.Root
      items={options}
      value={value}
      onValueChange={onChange}
      filter={(item, query) => fuzzyMatch(item, query)}
      mode="list"
      openOnInputClick
    >
      <Autocomplete.Input
        id={id}
        className="box-border h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-sm"
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      <Autocomplete.Portal>
        <Autocomplete.Positioner className="z-50" sideOffset={4}>
          <Autocomplete.Popup className="max-h-72 w-[var(--anchor-width)] min-w-64 overflow-y-auto rounded-md border border-input bg-card p-1 shadow-lg">
            <Autocomplete.Empty className="px-2 py-2 text-sm text-muted-foreground">
              No matching models
            </Autocomplete.Empty>
            <Autocomplete.List>
              {options.map((model) => (
                <Autocomplete.Item
                  key={model}
                  value={model}
                  className="cursor-default rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted data-[selected]:font-medium"
                >
                  {model}
                </Autocomplete.Item>
              ))}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}
