import { useState } from 'react';
import { useUserFeedback, useAverageRatings, type FeedbackFilters } from '@/hooks/useUserFeedback';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Star, MessageSquare, TrendingUp, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';

export const UserFeedback = () => {
  const [filters, setFilters] = useState<FeedbackFilters>({ page: 1, pageSize: 20 });
  const [period, setPeriod] = useState<number>(7);
  
  const { feedback, pagination, isLoading } = useUserFeedback(filters);
  const { data: avgStats } = useAverageRatings(period);

  const handleFilterChange = (value: string) => {
    if (value === 'all') {
      setFilters({ ...filters, minRating: undefined, maxRating: undefined, page: 1 });
    } else if (value === 'low') {
      setFilters({ ...filters, minRating: 1, maxRating: 2, page: 1 });
    }
  };

  const handlePageChange = (newPage: number) => {
    setFilters({ ...filters, page: newPage });
  };

  const renderStars = (rating: number | null) => {
    if (!rating) return <span className="text-muted-foreground">-</span>;
    
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${
              star <= rating 
                ? 'fill-yellow-400 text-yellow-400' 
                : 'text-gray-300'
            }`}
          />
        ))}
        <span className="ml-1 text-sm font-medium">{rating}</span>
      </div>
    );
  };

  const getRatingInfo = (rating: number | null): { variant: 'default' | 'secondary' | 'destructive', text: string } => {
    if (!rating) return { variant: 'secondary', text: '-' };
    if (rating >= 4) return { variant: 'default', text: 'Լավ' };
    if (rating >= 3) return { variant: 'secondary', text: 'Բավարար' };
    return { variant: 'destructive', text: 'Վատ' };
  };

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Միջին գնահատական
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {avgStats?.overallAverage.toFixed(1) || '0.0'}
            </div>
            <p className="text-xs text-muted-foreground">
              Վերջին {period} օրվա ընթացքում
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Ընդհանուր կարծիքներ
            </CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {avgStats?.totalFeedback || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Վերջին {period} օրվա ընթացքում
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Ժամանակաշրջան
            </CardTitle>
            <Filter className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Select
              value={period.toString()}
              onValueChange={(value) => setPeriod(Number(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 օր</SelectItem>
                <SelectItem value="14">14 օր</SelectItem>
                <SelectItem value="30">30 օր</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      {/* Feedback Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Օգտատերերի կարծիքներ
            </CardTitle>
            <Select onValueChange={handleFilterChange} defaultValue="all">
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Ֆիլտրել գնահատականով" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Բոլոր գնահատականները</SelectItem>
                <SelectItem value="low">Ցածր գնահատական ({'<'}3)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : feedback.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <MessageSquare className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-lg font-medium text-muted-foreground">
                Կարծիքներ չեն գտնվել
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Գործի համար</TableHead>
                    <TableHead>Օգտատեր</TableHead>
                    <TableHead>Գնահատական</TableHead>
                    <TableHead>Մեկնաբանություն</TableHead>
                    <TableHead>Ամսաթիվ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feedback.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.case_number || 'N/A'}
                      </TableCell>
                      <TableCell>{item.user_email || 'Unknown'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {renderStars(item.rating)}
                          {(() => {
                            const { variant, text } = getRatingInfo(item.rating);
                            return <Badge variant={variant} className="ml-2">{text}</Badge>;
                          })()}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="truncate" title={item.comment || ''}>
                          {item.comment || '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        {format(new Date(item.created_at), 'dd/MM/yyyy HH:mm')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Ցուցադրվում է {((pagination.page - 1) * pagination.pageSize) + 1}-
                    {Math.min(pagination.page * pagination.pageSize, pagination.total)} / {pagination.total}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={pagination.page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Նախորդ
                    </Button>
                    <div className="text-sm">
                      Էջ {pagination.page} / {pagination.totalPages}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(pagination.page + 1)}
                      disabled={pagination.page === pagination.totalPages}
                    >
                      Հաջորդ
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
