param([Parameter(Mandatory=$true)][string]$PrinterName,[Parameter(Mandatory=$true)][string]$TicketPath)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$payload=Get-Content -LiteralPath ([IO.Path]::ChangeExtension($TicketPath,'.json')) -Raw -Encoding UTF8 | ConvertFrom-Json
$source=@'
using System; using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices;
public static class RawPrinter {
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
 [DllImport("winspool.drv",SetLastError=true,CharSet=CharSet.Unicode)] static extern bool OpenPrinter(string n,out IntPtr h,IntPtr d);
 [DllImport("winspool.drv",SetLastError=true)] static extern bool ClosePrinter(IntPtr h);
 [DllImport("winspool.drv",SetLastError=true,CharSet=CharSet.Unicode)] static extern int StartDocPrinter(IntPtr h,int l,[In] DOCINFO i);
 [DllImport("winspool.drv",SetLastError=true)] static extern bool EndDocPrinter(IntPtr h);
 [DllImport("winspool.drv",SetLastError=true)] static extern bool StartPagePrinter(IntPtr h);
 [DllImport("winspool.drv",SetLastError=true)] static extern bool EndPagePrinter(IntPtr h);
 [DllImport("winspool.drv",SetLastError=true)] static extern bool WritePrinter(IntPtr h,IntPtr b,int c,out int w);
 public static byte[] Rasterize(Bitmap bitmap,int height){
  int width=bitmap.Width,widthBytes=(width+7)/8,bodyLength=widthBytes*height;
  byte[] output=new byte[10+bodyLength+6];int offset=0;
  byte[] header={0x1B,0x40,0x1D,0x76,0x30,0x00,(byte)(widthBytes&255),(byte)((widthBytes>>8)&255),(byte)(height&255),(byte)((height>>8)&255)};
  Buffer.BlockCopy(header,0,output,0,header.Length);offset=header.Length;
  var rect=new Rectangle(0,0,width,height);var data=bitmap.LockBits(rect,ImageLockMode.ReadOnly,PixelFormat.Format24bppRgb);
  try {int stride=Math.Abs(data.Stride);byte[] row=new byte[stride];for(int y=0;y<height;y++){IntPtr rowPtr=IntPtr.Add(data.Scan0,y*data.Stride);Marshal.Copy(rowPtr,row,0,stride);for(int bx=0;bx<widthBytes;bx++){int value=0;for(int bit=0;bit<8;bit++){int x=bx*8+bit;if(x>=width)continue;int pixel=x*3;int blue=row[pixel],green=row[pixel+1],red=row[pixel+2];int luma=(red*299+green*587+blue*114)/1000;if(luma<180)value|=(0x80>>bit);}output[offset++]=(byte)value;}}}
  finally {bitmap.UnlockBits(data);}
  byte[] footer={0x1B,0x64,0x04,0x1D,0x56,0x00};Buffer.BlockCopy(footer,0,output,offset,footer.Length);return output;
 }
 public static void Send(string printer,byte[] data){IntPtr h;if(!OpenPrinter(printer,out h,IntPtr.Zero))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());try{var i=new DOCINFO{pDocName="REVTROVE Receipt",pDataType="RAW"};if(StartDocPrinter(h,1,i)==0)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());try{StartPagePrinter(h);IntPtr p=Marshal.AllocCoTaskMem(data.Length);try{Marshal.Copy(data,0,p,data.Length);int w;if(!WritePrinter(h,p,data.Length,out w))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());}finally{Marshal.FreeCoTaskMem(p);}EndPagePrinter(h);}finally{EndDocPrinter(h);}}finally{ClosePrinter(h);}}
}
'@
$drawingAssembly=[Drawing.Bitmap].Assembly.Location
Add-Type -TypeDefinition $source -ReferencedAssemblies $drawingAssembly
$width=576;$height=3200
$bitmap=New-Object Drawing.Bitmap($width,$height,[Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g=[Drawing.Graphics]::FromImage($bitmap);$g.Clear([Drawing.Color]::White);$g.TextRenderingHint=[Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$black=[Drawing.Brushes]::Black;$pen=[Drawing.Pen]::new([Drawing.Color]::Black,2)
$storeFont=[Drawing.Font]::new('Arial',38,[Drawing.FontStyle]::Bold,[Drawing.GraphicsUnit]::Pixel)
$titleFont=[Drawing.Font]::new('Arial',30,[Drawing.FontStyle]::Bold,[Drawing.GraphicsUnit]::Pixel)
$textFont=[Drawing.Font]::new('Arial',24,[Drawing.FontStyle]::Bold,[Drawing.GraphicsUnit]::Pixel)
$smallFont=[Drawing.Font]::new('Arial',20,[Drawing.FontStyle]::Regular,[Drawing.GraphicsUnit]::Pixel)
$center=[Drawing.StringFormat]::new();$center.Alignment=[Drawing.StringAlignment]::Center
$format=[Drawing.StringFormat]::new()
if($payload.direction -eq 'rtl'){$format.Alignment=[Drawing.StringAlignment]::Far;$format.FormatFlags=[Drawing.StringFormatFlags]::DirectionRightToLeft}else{$format.Alignment=[Drawing.StringAlignment]::Near}
$y=18
$cachedLogoPath=Join-Path $PSScriptRoot 'revtrove-print-logo.png'
if(Test-Path -LiteralPath $cachedLogoPath){$cachedLogo=[Drawing.Image]::FromFile($cachedLogoPath);try{$g.DrawImage($cachedLogo,[int](($width-$cachedLogo.Width)/2),$y,$cachedLogo.Width,$cachedLogo.Height);$y+=$cachedLogo.Height+14;$payload.logoPath=''}finally{$cachedLogo.Dispose()}}
if($payload.logoPath -and (Test-Path -LiteralPath $payload.logoPath)){$logo=[Drawing.Bitmap]::FromFile($payload.logoPath);try{$minX=$logo.Width;$minY=$logo.Height;$maxX=0;$maxY=0;for($ly=0;$ly-lt$logo.Height;$ly+=2){for($lx=0;$lx-lt$logo.Width;$lx+=2){$pixel=$logo.GetPixel($lx,$ly);if([Math]::Max($pixel.R,[Math]::Max($pixel.G,$pixel.B))-gt55){$minX=[Math]::Min($minX,$lx);$minY=[Math]::Min($minY,$ly);$maxX=[Math]::Max($maxX,$lx);$maxY=[Math]::Max($maxY,$ly)}}};if($maxX-gt$minX-and$maxY-gt$minY){$targetWidth=500;$targetHeight=[Math]::Max(70,[int]($targetWidth*(($maxY-$minY)/($maxX-$minX))));$mask=[Drawing.Bitmap]::new($targetWidth,$targetHeight,[Drawing.Imaging.PixelFormat]::Format24bppRgb);$mg=[Drawing.Graphics]::FromImage($mask);$mg.Clear([Drawing.Color]::White);$mg.DrawImage($logo,[Drawing.Rectangle]::new(0,0,$targetWidth,$targetHeight),[Drawing.Rectangle]::new($minX,$minY,($maxX-$minX),($maxY-$minY)),[Drawing.GraphicsUnit]::Pixel);$mg.Dispose();for($my=0;$my-lt$targetHeight;$my++){for($mx=0;$mx-lt$targetWidth;$mx++){$pixel=$mask.GetPixel($mx,$my);if([Math]::Max($pixel.R,[Math]::Max($pixel.G,$pixel.B))-gt55){$mask.SetPixel($mx,$my,[Drawing.Color]::Black)}else{$mask.SetPixel($mx,$my,[Drawing.Color]::White)}}};$g.DrawImage($mask,[int](($width-$targetWidth)/2),$y,$targetWidth,$targetHeight);$y+=$targetHeight+14;$mask.Dispose()}}finally{$logo.Dispose()}}
$g.DrawString([string]$payload.store.name,$storeFont,$black,[Drawing.RectangleF]::new(14,$y,($width-28),56),$center);$y+=54
$g.DrawString([string]$payload.store.phone,$smallFont,$black,[Drawing.RectangleF]::new(14,$y,($width-28),34),$center);$y+=30
$g.DrawString([string]$payload.store.email,$smallFont,$black,[Drawing.RectangleF]::new(14,$y,($width-28),34),$center);$y+=40
$g.DrawLine($pen,12,$y,$width-12,$y);$y+=14
$g.DrawString([string]$payload.orderId,$titleFont,$black,[Drawing.RectangleF]::new(14,$y,($width-28),48),$center);$y+=54
foreach($section in $payload.sections){$g.DrawLine($pen,12,$y,($width-12),$y);$y+=14;$g.DrawString([string]$section.title,$titleFont,$black,[Drawing.RectangleF]::new(18,$y,($width-36),52),$format);$y+=52;foreach($row in $section.rows){$line="{0}: {1}" -f [string]$row.label,[string]$row.value;$size=$g.MeasureString($line,$textFont,($width-40),$format);$lh=[Math]::Max(42,[Math]::Ceiling($size.Height)+7);$g.DrawString($line,$textFont,$black,[Drawing.RectangleF]::new(20,$y,($width-40),$lh),$format);$y+=$lh};$y+=10}
$g.DrawLine($pen,12,$y,$width-12,$y);$y+=20
$footerFormat=if($payload.direction -eq 'rtl'){$format}else{$center};$size=$g.MeasureString([string]$payload.thanks,$titleFont,($width-36),$footerFormat);$lh=[Math]::Ceiling($size.Height)+10
$g.DrawString([string]$payload.thanks,$titleFont,$black,[Drawing.RectangleF]::new(18,$y,($width-36),$lh),$footerFormat);$y+=$lh+12
$g.DrawString([string]$payload.printedAt,$smallFont,$black,[Drawing.RectangleF]::new(14,$y,($width-28),34),$footerFormat);$y+=48;$g.Dispose()
$finalHeight=[Math]::Min($height,[Math]::Max(120,$y));$bytes=[RawPrinter]::Rasterize($bitmap,$finalHeight);$bitmap.Dispose();[RawPrinter]::Send($PrinterName,$bytes)
