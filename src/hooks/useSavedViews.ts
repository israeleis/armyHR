import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { getSelectedSheet } from '@/features/sheet-picker/SheetPickerScreen'
import { loadSavedViews, saveView, deactivateView } from '@/data/customViewsClient'
import type { FilterState } from '@/features/filters'

export function useSavedViews() {
  const { token, userEmail } = useAuth()
  const sheet = getSelectedSheet()
  const queryClient = useQueryClient()
  const queryKey = ['saved-views', sheet?.id]

  const query = useQuery({
    queryKey,
    queryFn: () => loadSavedViews(token!, sheet!.id),
    enabled: !!token && !!sheet,
    staleTime: 1000 * 60,
  })

  const saveMutation = useMutation({
    mutationFn: ({ name, view, filterState, groupByKeys = [] }: { name: string; view: string; filterState: FilterState; groupByKeys?: string[] }) =>
      saveView(token!, sheet!.id, {
        name,
        view,
        sheetId: sheet!.id,
        tabName: sheet!.tabName,
        filterState,
        groupByKeys,
        active: true,
        createdBy: userEmail ?? '',
        createdAt: new Date().toISOString(),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const deactivateMutation = useMutation({
    mutationFn: (rowIndex: number) => deactivateView(token!, sheet!.id, rowIndex),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  return {
    views: query.data ?? [],
    isLoading: query.isLoading,
    saveView: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    deactivateView: deactivateMutation.mutate,
  }
}
