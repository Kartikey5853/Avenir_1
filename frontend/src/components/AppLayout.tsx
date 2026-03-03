import { useLocation, useNavigate } from 'react-router-dom';
import { MapPin, LayoutDashboard, Building2, TrendingUp, LogOut, Settings, User, Menu, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Dock, { DockItemData } from '@/components/Dock';
import ShinyText from '@/components/ShinyText';
import { getProfile } from '@/services/api';

const AppLayout = ({ children, noPadding = false }: { children: React.ReactNode; noPadding?: boolean }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [profilePic, setProfilePic] = useState<string | null>(null);
  const user = JSON.parse(localStorage.getItem('avenir_user') || '{"name":"Guest"}');

  useEffect(() => {
    getProfile()
      .then((res) => {
        if (res.data?.profile_picture) {
          setProfilePic(res.data.profile_picture);
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('avenir_token');
    localStorage.removeItem('avenir_user');
    navigate('/login');
  };

  const initials = user.name
    ? user.name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'G';

  const dockItems: DockItemData[] = [
    {
      icon: <LayoutDashboard className="h-5 w-5 text-white" />,
      label: 'Dashboard',
      onClick: () => navigate('/dashboard'),
      className: location.pathname === '/dashboard' ? 'border-primary' : '',
    },
    {
      icon: <MapPin className="h-5 w-5 text-white" />,
      label: 'Map View',
      onClick: () => navigate('/map'),
      className: location.pathname === '/map' ? 'border-primary' : '',
    },
    {
      icon: <Building2 className="h-5 w-5 text-white" />,
      label: 'Facilities',
      onClick: () => navigate('/facilities'),
      className: location.pathname === '/facilities' ? 'border-primary' : '',
    },
    {
      icon: <TrendingUp className="h-5 w-5 text-white" />,
      label: 'Market Insights',
      onClick: () => navigate('/market'),
      className: location.pathname === '/market' ? 'border-primary' : '',
    },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col relative">
      {/* Top bar - just logo + profile avatar */}
      <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-border">
        <div className="flex items-center justify-between h-14 px-4 md:px-6">          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/dashboard')}>
            <ShinyText
              text="Avenir"
              speed={3}
              className="font-bold text-xl"
              color="oklch(0.637 0.128 66.29)"
              shineColor="oklch(0.937 0.128 66.29)"
              spread={120}
              direction="left"
              yoyo
              pauseOnHover
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
                <Avatar className="h-9 w-9 cursor-pointer border-2 border-border hover:border-primary transition-colors">
                  <AvatarImage src={profilePic || undefined} alt={user.name} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/profile')} className="cursor-pointer">
                <User className="h-4 w-4 mr-2" /> Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/settings')} className="cursor-pointer">
                <Settings className="h-4 w-4 mr-2" /> Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive">
                <LogOut className="h-4 w-4 mr-2" /> Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>      {/* Main content - extra bottom padding for dock */}
      <main className={`flex-1 ${noPadding ? '' : 'pb-24'}`}>{children}</main>

      {/* Bottom Dock */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
        <div className="pointer-events-auto">
          <Dock
            items={dockItems}
            magnification={60}
            baseItemSize={44}
            panelHeight={58}
            distance={150}
            className="bg-card/90 backdrop-blur-md border-border"
          />
        </div>
      </div>
    </div>
  );
};

export default AppLayout;
