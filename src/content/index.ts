import { createMessageHandler } from "@/core";

const handler = createMessageHandler();

// Message handlers for adapter operations will be registered here
// as the adapter layer is built.

handler.start();
