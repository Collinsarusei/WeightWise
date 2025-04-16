import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';

export default function Home() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">WeightWise AI Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Current Weight</CardTitle>
            <CardDescription>Your most recent weight entry.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">70 kg</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Target Weight</CardTitle>
            <CardDescription>Your goal weight.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">65 kg</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI-Powered Advice</CardTitle>
            <CardDescription>Your personalized daily tip.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xl">"Stay hydrated by drinking water consistently throughout the day."</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

