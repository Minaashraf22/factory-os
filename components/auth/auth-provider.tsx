useEffect(() => {
  const init = async () => {
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
      await fetchProfile(session.user.id);
    } else {
      setProfile(null);
    }

    setLoading(false);
  };

  init();

  const { data: { subscription } } =
    supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        router.replace('/login');
      }
    });

  return () => subscription.unsubscribe();
}, [fetchProfile, router]);
