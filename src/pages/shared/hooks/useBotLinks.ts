import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  captureBotRefFromSearch,
  DEFAULT_BOT_LINKS,
  getPreferredBotIdentifier,
  getResolvedBotLinks,
  type BotLinksData,
} from "../api/terminalAuth";

interface BotLinksState {
  links: BotLinksData;
  isLoading: boolean;
}

export default function useBotLinks(): BotLinksState {
  const location = useLocation();
  const [links, setLinks] = useState<BotLinksData>(DEFAULT_BOT_LINKS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const preferredBot = getPreferredBotIdentifier(location.search);
    captureBotRefFromSearch(location.search);

    let active = true;
    setIsLoading(true);

    void getResolvedBotLinks(preferredBot)
      .then((data) => {
        if (!active) return;
        setLinks(data);
      })
      .finally(() => {
        if (!active) return;
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [location.search]);

  return { links, isLoading };
}
