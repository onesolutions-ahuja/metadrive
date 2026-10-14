import {z} from 'zod';
export const pageComponentSchema=z.object({
 id:z.string().min(1),type:z.string().min(1),label:z.string().min(1),
 properties:z.record(z.unknown()).default({}),visible:z.boolean()
});
