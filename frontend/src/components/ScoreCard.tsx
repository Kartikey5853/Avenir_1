import { ReactNode } from 'react';

interface ScoreCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  accent?: boolean;
}

const ScoreCard = ({ title, value, subtitle, icon, accent }: ScoreCardProps) => (
  <div
    className={`rounded-xl border border-border p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover ${
      accent ? 'gradient-warm text-primary-foreground' : 'bg-card shadow-card'
    }`}
  >
    <div className="flex items-start justify-between mb-3">
      <p className={`text-sm font-medium ${accent ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
        {title}
      </p>
      {icon && <div className={accent ? 'text-primary-foreground/70' : 'text-muted-foreground'}>{icon}</div>}
    </div>
    <p className="text-2xl font-bold">{value}</p>
    {subtitle && (
      <p className={`text-xs mt-1 ${accent ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
        {subtitle}
      </p>
    )}
  </div>
);

export default ScoreCard;
