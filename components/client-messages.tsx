import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import {
  moduleNamespaces,
  pickMessages,
  SHELL_NAMESPACES,
  type ClientModule,
} from "@/lib/i18n/client-namespaces";

/**
 * Provides Client Components with only the message namespaces they use: the
 * shell set by default, or shell + a module's set. Keeps the full messages
 * file out of every page's HTML/RSC payload.
 */
export async function ClientMessages({
  module,
  children,
}: {
  module?: ClientModule;
  children: React.ReactNode;
}) {
  const messages = await getMessages();
  const namespaces = module ? moduleNamespaces(module) : SHELL_NAMESPACES;
  return (
    <NextIntlClientProvider messages={pickMessages(messages, namespaces)}>
      {children}
    </NextIntlClientProvider>
  );
}
