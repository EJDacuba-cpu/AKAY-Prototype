import ModuleToolbar from "./ModuleToolbar";

export default function ListToolbar({
  filterButtonLabel = "Filters",
  actions = null,
  ...props
}) {
  return (
    <ModuleToolbar
      {...props}
      filtersLabel={filterButtonLabel}
      actions={actions}
    />
  );
}
