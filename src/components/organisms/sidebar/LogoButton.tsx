// src/components/organisms/sidebar/LogoButton.tsx
/**
 * Shared LogoButton — theme-aware logo with home navigation.
 * Collapsed: w-16 h-16 icon. Expanded: h-36 full logo.
 */
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/shared/utils/cn';

interface LogoButtonProps {
  collapsed: boolean;
  onClick: () => void;
  className?: string;
}

export function LogoButton({ collapsed, onClick, className }: LogoButtonProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const logoSrc = isDark ? '/logodark.webp' : '/logolight.webp';

  return (
    <div className={cn('p-4 flex items-center justify-center', className)}>
      <button
        type="button"
        data-testid="sidebar-logo"
        onClick={onClick}
        className="hover:opacity-80 transition-opacity"
      >
        <img
          src={logoSrc}
          alt="EPS AI Solutions"
          className={cn(
            'object-contain',
            collapsed ? 'w-16 h-16' : 'h-36',
          )}
        />
      </button>
    </div>
  );
}
