import { useConfig } from '../context/ConfigContext';
import { LinkCard } from '../components/LinkCard';

export function LinksView() {
  const { config, loading } = useConfig();

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="font-mono text-zinc-500 text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {config.links.length === 0 ? (
        <p className="font-mono text-zinc-500 text-sm">
          No links yet. Add one in Settings.
        </p>
      ) : (
        <div className="flex flex-wrap gap-4">
          {config.links.map((link) => (
            <LinkCard key={link.id} link={link} />
          ))}
        </div>
      )}
    </div>
  );
}
